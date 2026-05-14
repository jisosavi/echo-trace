#!/usr/bin/env node
import { appendFile, readFile } from 'node:fs/promises';
import { insertComparison, existsByUrlAndQuote, getAllEchoEmbeddings } from './db.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ARCHIVE_PATH = path.join(ROOT_DIR, 'archival-memory.json');
const LOG_PATH = path.join(ROOT_DIR, 'agent/data/cycle.log');

function nowIso() {
  return new Date().toISOString();
}

async function log(message) {
  await appendFile(LOG_PATH, `[${nowIso()}] [analyze-one-url] ${message}\n`, 'utf8');
}

function safeIdPart(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMetaContent(html, attrName, attrValue) {
  const escapedValue = escapeRegex(attrValue);
  const pattern = new RegExp(
    `<meta[^>]*${attrName}=["']${escapedValue}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    'i'
  );
  const match = html.match(pattern);
  return match ? normalizeWhitespace(decodeHtmlEntities(match[1])) : '';
}

function htmlToText(html) {
  const stripped = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|article|section|h1|h2|h3|li|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return normalizeWhitespace(decodeHtmlEntities(stripped));
}

function extractJsonLdArticleBodies(html) {
  const results = [];
  const scriptPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  function collectBodies(node) {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        collectBodies(item);
      }
      return;
    }

    const type = node['@type'];
    const types = Array.isArray(type) ? type.map((v) => String(v).toLowerCase()) : [String(type || '').toLowerCase()];
    const isArticleType = types.some((t) => t.includes('article') || t.includes('newsarticle'));
    if (isArticleType && typeof node.articleBody === 'string' && node.articleBody.trim()) {
      results.push(normalizeWhitespace(decodeHtmlEntities(node.articleBody)));
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') {
        collectBodies(value);
      }
    }
  }

  while ((match = scriptPattern.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      collectBodies(parsed);
    } catch {
      // Ignore invalid/templated JSON-LD scripts.
    }
  }

  return results;
}

function extractLikelyArticleHtml(html) {
  const containerPatterns = [
    /<article\b[^>]*>([\s\S]*?)<\/article>/gi,
    /<main\b[^>]*>([\s\S]*?)<\/main>/gi,
    /<div\b[^>]*class=["'][^"']*(?:article|story|content|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi
  ];

  const segments = [];
  for (const pattern of containerPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      segments.push(match[1]);
      if (segments.length >= 8) {
        break;
      }
    }
    if (segments.length >= 8) {
      break;
    }
  }

  return segments.length > 0 ? segments.join('\n') : html;
}

function extractParagraphText(html) {
  const paragraphs = [];
  const pattern = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const text = htmlToText(match[1]);
    if (text.length >= 40) {
      paragraphs.push(text);
    }
  }
  return paragraphs;
}

function pickDomParagraphBody(paragraphs) {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    return '';
  }

  // Readability-like heuristic: prefer dense paragraph text with enough volume.
  const joined = paragraphs.join(' ');
  if (joined.length < 240) {
    return '';
  }
  return normalizeWhitespace(joined);
}

function removeBoilerplate(text) {
  const blacklist = [
    'fox nation',
    'watch live',
    'market data',
    'newsletters',
    'crossword',
    'sudoku',
    'terms of use',
    'privacy policy',
    'cookie policy'
  ];
  return text
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 0)
    .filter((line) => !blacklist.some((term) => line.toLowerCase().includes(term)))
    .join(' ');
}

function quoteHasUsefulSignal(sentence) {
  const lower = sentence.toLowerCase();
  return (
    /\b(said|says|told|stated|warned|claimed|announced|according to)\b/.test(lower) ||
    lower.includes('putin') ||
    lower.includes('russian leader') ||
    sentence.includes('"') ||
    sentence.includes('“')
  );
}

function isBoilerplateQuote(quote) {
  const q = quote.trim();
  return (
    q.startsWith('©') ||
    /all rights reserved/i.test(q) ||
    /derechos reservados/i.test(q) ||
    /droits réservés/i.test(q) ||
    /\(\+\d{2,}\).*\(\+\d{2,}\)/.test(q) ||  // multiple phone numbers
    /sitio diseñado/i.test(q)
  );
}

const NO_PROPAGANDA_PATTERNS = [
  /^N\/A\s*[—–-]/i,
  /^None\s*[—–-]/i,
  /no propaganda/i,
  /not.*propaganda/i,
  /non-propaganda/i,
  /no.*disinformation/i,
  /legitimate.*news/i,
  /factual.*report/i,
  /website footer/i,
  /horoscope/i,
  /sports journalism/i,
  /educational content/i,
  /commercial aviation/i,
  /crime.*report/i,
  /domestic.*no propaganda/i,
  /not.*related.*propaganda/i,
  /no.*trope.*detected/i,
  /no propaganda.*detected/i,
];

function isPropagandaContent(claudeResult) {
  const theme = claudeResult?.analysis?.theme ?? '';
  return !NO_PROPAGANDA_PATTERNS.some((p) => p.test(theme));
}

function isWeakExtraction(text, quote) {
  if (!text || text.length < 260) {
    return true;
  }
  if (!quote || quote.length < 50) {
    return true;
  }
  const lowerQuote = quote.toLowerCase();
  const navigationNoise = [
    'watch live',
    'fox nation',
    'crossword',
    'sudoku',
    'terms of use',
    'privacy policy'
  ];
  if (navigationNoise.some((token) => lowerQuote.includes(token))) {
    return true;
  }
  return !quoteHasUsefulSignal(quote);
}

function splitSentences(text) {
  return text
    .replace(/\s+"/g, ' "')
    .split(/(?<=[.!?]["”']?)\s+(?=[A-Z0-9"“])/)
    .map((s) => normalizeWhitespace(s))
    .filter((s) => s.length >= 40)
    .filter((s) => s.length <= 420);
}

function extractQuotedCandidates(text) {
  const candidates = [];
  const patterns = [
    /"([^"]{40,420})"/g,
    /“([^”]{40,420})”/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      candidates.push(normalizeWhitespace(match[1]));
      if (candidates.length >= 20) {
        break;
      }
    }
    if (candidates.length >= 20) {
      break;
    }
  }
  return candidates;
}

function scoreSentence(sentence, archive) {
  const lower = sentence.toLowerCase();
  let score = 0;

  // Prefer direct speech and attributed claims.
  if (lower.includes('putin')) score += 4;
  if (/\b(russian leader|kremlin|president)\b/.test(lower)) score += 2;
  if (/\b(said|says|told|stated|warned|claimed|announced)\b/.test(lower)) score += 2;
  if (sentence.includes('"') || sentence.includes('“') || sentence.includes('”')) score += 2;
  if (/\b(ready and willing|peacefully|war in ukraine)\b/.test(lower)) score += 2;
  if (sentence.length >= 80 && sentence.length <= 240) score += 1;

  for (const trope of archive?.rhetorical_tropes ?? []) {
    for (const keyword of trope?.modern_keywords ?? []) {
      if (lower.includes(String(keyword).toLowerCase())) {
        score += 1;
      }
    }
  }

  return score;
}

function pickBestQuote(text, archive) {
  const sentences = splitSentences(text);
  const quoted = extractQuotedCandidates(text);
  const allCandidates = [...quoted, ...sentences];

  if (allCandidates.length === 0) {
    return text.slice(0, 220);
  }

  const scored = allCandidates.map((sentence) => ({ sentence, score: scoreSentence(sentence, archive) }));

  scored.sort((a, b) => b.score - a.score || b.sentence.length - a.sentence.length);
  const best = scored[0].sentence.slice(0, 320);
  if (quoteHasUsefulSignal(best)) {
    return best;
  }

  const signalCandidate = scored.find((item) => quoteHasUsefulSignal(item.sentence));
  return (signalCandidate?.sentence ?? best).slice(0, 320);
}

function pickTropeFromText(archive, text) {
  const haystack = text.toLowerCase();
  const tropes = archive?.rhetorical_tropes ?? [];
  let bestTrope = null;
  let bestHits = 0;

  for (const trope of tropes) {
    const keywords = Array.isArray(trope.modern_keywords) ? trope.modern_keywords : [];
    let hits = 0;
    for (const keyword of keywords) {
      if (haystack.includes(String(keyword).toLowerCase())) {
        hits += 1;
      }
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestTrope = trope;
    }
  }

  return { trope: bestTrope ?? tropes[0] ?? null, keywordHits: bestHits };
}

async function fetchArticleText(targetUrl) {
  const response = await fetch(targetUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status} ${response.statusText})`);
  }

  const html = await response.text();

  // Primary: Mozilla Readability (Firefox's article extractor)
  try {
    const dom = new JSDOM(html, { url: targetUrl });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (article?.textContent) {
      const text = normalizeWhitespace(article.textContent);
      if (text.length >= 240) {
        return {
          text,
          extractionMethod: 'readability',
          evidenceSnippet: text.slice(0, 220)
        };
      }
    }
  } catch {
    // Fall through to legacy extractors.
  }

  // Fallback: JSON-LD → DOM paragraphs → raw text
  const articleHtml = extractLikelyArticleHtml(html);
  const jsonLdBodies = extractJsonLdArticleBodies(html);
  const description =
    extractMetaContent(html, 'property', 'og:description') || extractMetaContent(html, 'name', 'description');
  const paragraphText = pickDomParagraphBody(extractParagraphText(articleHtml));
  const fallbackBody = removeBoilerplate(htmlToText(articleHtml));

  let extractionMethod = 'fallback_text';
  let primaryText = '';

  const jsonLdJoined = normalizeWhitespace(jsonLdBodies.join(' '));
  if (jsonLdJoined.length >= 240) {
    extractionMethod = 'jsonld';
    primaryText = jsonLdJoined;
  } else if (paragraphText.length >= 240) {
    extractionMethod = 'dom_paragraphs';
    primaryText = paragraphText;
  } else {
    primaryText = fallbackBody;
  }

  const combined = normalizeWhitespace(`${description} ${primaryText}`.trim());

  if (!combined) {
    throw new Error('Fetched page but extracted no readable text.');
  }

  return {
    text: combined,
    extractionMethod,
    evidenceSnippet: combined.slice(0, 220)
  };
}

async function fetchArticleTextWithPuppeteer(targetUrl) {
  let puppeteerModule;
  try {
    puppeteerModule = await import('puppeteer');
  } catch {
    return null;
  }

  const puppeteer = puppeteerModule.default ?? puppeteerModule;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 1500));

    const extracted = await page.evaluate(() => {
      const readMeta = (selector) => {
        const el = document.querySelector(selector);
        return el?.getAttribute('content')?.trim() ?? '';
      };

      const article = document.querySelector('article') || document.querySelector('main') || document.body;
      const paragraphs = Array.from(article.querySelectorAll('p'))
        .map((p) => (p.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((text) => text.length >= 40);

      return {
        description: readMeta('meta[property="og:description"]') || readMeta('meta[name="description"]'),
        paragraphText: paragraphs.join(' ')
      };
    });

    const combined = normalizeWhitespace(`${extracted.description} ${extracted.paragraphText}`.trim());
    if (!combined) {
      return null;
    }

    return {
      text: combined,
      extractionMethod: 'puppeteer_dom',
      evidenceSnippet: combined.slice(0, 220)
    };
  } finally {
    await browser.close();
  }
}

async function classifyTropeWithClaude(articleText, archive) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  const tropes = archive?.rhetorical_tropes ?? [];
  if (tropes.length === 0) {
    return null;
  }

  const tropeList = tropes
    .map((t) => `- id: "${t.id}", theme: "${t.theme}"`)
    .join('\n');

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are a forensic rhetorical analyst. Analyze the following article excerpt using all of these propaganda taxonomies simultaneously.

TROPES — classify into exactly one (or "unclassified"):
${tropeList}

NARRATIVE STRATEGY (Lank & Antai 2025) — pick one:
- suppression: Diminishes target's status/character through negative portrayal
- destruction: Damages target's military/strategic reliability; portrays as weak and untrustworthy
- direction: Steers behavior via incentives and disincentives toward preferred outcomes
- exploitation: Co-opts third-party narratives into own framework by omitting contextual facts

SAN MARTINO TECHNIQUES — pick all that apply (Da San Martino et al. 2019, 18 techniques):
Appeal to Authority, Appeal to Fear/Prejudice, Bandwagon, Black-and-White Fallacy, Causal Oversimplification, Doubt, Exaggeration/Minimisation, Flag-Waving, Loaded Language, Name Calling/Labeling, Obfuscation/Vagueness, Red Herring, Repetition, Slogans, Straw Man, Thought-terminating Clichés, Whataboutism, Smears

IPA TECHNIQUES — pick all that apply (Institute for Propaganda Analysis, 1937):
Name-calling, Glittering generalities, Transfer, Testimonial, Plain folks, Card stacking, Bandwagon

NIMMO 4D — pick one (DFRLab / Ben Nimmo):
- Dismiss: Attacks the messenger to undermine credibility rather than addressing the claim
- Distort: Fabricates or manipulates facts; rewrites historical narratives
- Distract: Redirects attention via subject-switching or whataboutism
- Dismay: Intimidates through fear-based threats or conspiracy framing

ELLUL TYPE — pick one (Ellul 1965):
- agitation: Short-term emotional mobilization; seeks immediate behavioral response
- integration: Long-term worldview normalization; sociological conditioning

ELLUL AXIS — pick one (Ellul 1965):
- vertical: State/authority broadcast to public (top-down)
- horizontal: Peer-to-peer, grassroots-seeming diffusion

ECO PROPERTY — pick all that apply (Eco, "Ur-Fascism" 1995, 14 features):
The Cult of Tradition, The Rejection of Modernism, The Cult of Action for Action's Sake, Disagreement is Treason, Fear of Difference, Appeal to a Frustrated Middle Class, Obsession with a Plot, Enemies Too Strong and Too Weak, Pacifism as Enemy Collaboration, Contempt for the Weak, Education Toward Heroism, Machismo, Selective Populism, Newspeak

EUVSDISINFO NARRATIVES — pick all that apply (EUvsDisinfo, 6 key pro-Kremlin narratives):
- Elites vs People: Blames a shadowy elite (bankers, globalists, Anglo-Saxons) for ordinary people's grievances
- Threatened Values: Portrays the West as morally decayed; Russia as defender of tradition and decency
- Lost Sovereignty: Claims target states are puppet regimes controlled by outside powers (US, NATO, Anglo-Saxons)
- Imminent Collapse: Portrays Western institutions, economies or nations as on the verge of breakdown
- Hahaganda: Deploys ridicule, satire and mockery to delegitimise opponents without engaging their arguments
- Nazis: Labels adversaries as Nazis or fascists to delegitimise them and justify aggression

EUVSDISINFO RHETORIC — pick all that apply (EUvsDisinfo SWAMPED, 7 rhetorical devices):
- Straw Man: Attacks views the opponent never expressed; most common form is the "Nazi" label
- Whataboutism: Deflects criticism by raising a counter-accusation or unrelated issue
- Attack: Uses brutal or dehumanising language to silence and discourage the opposition
- Mockery: Uses sarcasm and ridicule to belittle rather than engage arguments
- Provocations: Pre-emptively accuses the opponent of planning a false-flag operation
- Exhaust: Drowns the opponent in technicalities and peripheral details to avoid the core issue
- Denial: Flatly denies all evidence regardless of its strength

EUVSDISINFO CONSPIRACY THEORIES — pick all that apply (EUvsDisinfo; Shadow Government archetype and its named variants):
- Shadow Government / Deep State: A secret elite ruling the world behind the scenes; absence of proof is treated as proof of concealment
- Rothschilds / Banker Conspiracy: Rothschild family or unnamed international bankers covertly controlling global finance and politics
- Protocols / Jewish Plot: Antisemitic trope claiming a coordinated Jewish conspiracy for world domination
- Soros Conspiracy: George Soros secretly funding protests, "color revolutions", and social destabilisation
- Anglo-Saxon Plot: US and UK orchestrating global events against Russia and Slavic peoples
- Color Revolution Conspiracy: Popular protests reframed as foreign-staged coups, never genuine civic movements
- Climate Hoax: Climate change as a fabricated crisis used by elites or bankers to control economies
- Big Pharma / Vaccine Conspiracy: Pharmaceutical industry hiding cures, manufacturing diseases, or using vaccines for control
- Gay / LGBTQ Lobby: LGBTQ rights as a coordinated elite agenda to destroy traditional society
- False Flag: Real events (attacks, disasters) staged by governments or elites to manufacture political justification

DISARM TTPs — pick all that apply (DISARM Framework / EUvsDisinfo; content-detectable techniques only):
- Fabricated Content: Completely invented stories, quotes, statistics, or events
- Manipulated Content: Real content altered to distort its meaning or context
- False Attribution: Misattributing statements, images, or actions to real people or institutions
- False Context: Genuine content paired with fabricated contextual framing
- Fake Experts: Citing non-existent, unqualified, or undisclosed paid experts as authorities
- Forced Confessions: Using scripted, coerced, or context-stripped testimonial "evidence"
- Video/Image Manipulation: Deepfakes, out-of-context imagery, or digitally altered media
- Infoshum: Flooding the information space with high-volume noise to obscure truth
- Firehose of Falsehood: Rapid-fire contradictory claims that overwhelm fact-checking capacity
- Conspiracy Amplification: Repeating and legitimising conspiracy narratives as plausible alternatives
- Narrative Laundering: Seeding fringe claims into mainstream via intermediary outlets
- Data Void Exploitation: Filling low-information gaps with disinformation before facts emerge
- Strategic Decontextualization: Stripping context from real events to reverse their meaning
- Impersonation: Posing as legitimate news sources, officials, or grassroots movements
- Emotional Manipulation: Using fear, outrage, or manufactured hope to bypass critical reasoning

Respond with JSON only, no prose:
{
  "trope_id": "...",
  "confidence": 0.0,
  "reasoning": "...",
  "analysis": {
    "theme": "...",
    "narrative_strategy": "...",
    "san_martino_techniques": [],
    "ipa_techniques": [],
    "nimmo_4d": "...",
    "ellul_type": "...",
    "ellul_axis": "...",
    "eco_properties": [],
    "eudisinfo_narratives": [],
    "eudisinfo_rhetoric": [],
    "eudisinfo_conspiracy": [],
    "eudisinfo_ttp": []
  }
}

Article:
${articleText.slice(0, 3000)}`
      }
    ]
  });

  const raw = message.content[0].text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  const result = JSON.parse(jsonMatch[0]);
  const trope = tropes.find((t) => t.id === result.trope_id) ?? null;
  return {
    trope,
    confidence: Number(result.confidence ?? 0),
    reasoning: result.reasoning ?? '',
    analysis: result.analysis ?? null
  };
}

async function translateQuoteIfNeeded(quote) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Detect the language of the following text. If it is English, respond with {"language":"English","translation":null}. If it is not English, translate it into formal UK English and respond with {"language":"<detected language full name in English>","translation":"<UK English translation>"}.

Text: ${JSON.stringify(quote)}

Respond with JSON only, no prose.`
      }
    ]
  });

  const raw = message.content[0].text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let result;
  try {
    result = JSON.parse(jsonMatch[0]);
  } catch {
    // LLM sometimes includes unescaped quotes inside the translation value.
    // Fall back to extracting fields with regex.
    const langM = jsonMatch[0].match(/"language"\s*:\s*"([^"]+)"/);
    const transM = jsonMatch[0].match(/"translation"\s*:\s*"([\s\S]+?)"\s*\}/);
    if (!langM || !transM) return null;
    result = { language: langM[1], translation: transM[1].replace(/\\"/g, '"') };
  }

  if (!result.translation || result.language === 'English') return null;
  return { language: result.language, translation: result.translation };
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function embedText(text, voyageKey) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${voyageKey}` },
    body: JSON.stringify({ model: 'voyage-3-lite', input: [text] }),
  });
  if (!res.ok) throw new Error(`Voyage embed error ${res.status}: ${await res.text()}`);
  return (await res.json()).data[0].embedding;
}

async function runHistoricalAnalysis(modernQuote, trope, articleText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !trope) return null;

  const client = new Anthropic({ apiKey });
  const voyageKey = process.env.VOYAGE_API_KEY;

  let candidateEchoes;

  // Cross-trope path: embed the modern quote and find nearest neighbours globally
  if (voyageKey) {
    try {
      const allRows = getAllEchoEmbeddings();
      if (allRows.length > 0) {
        const queryVec = await embedText(modernQuote, voyageKey);
        const scored = allRows.map((row) => ({ ...row, score: cosine(queryVec, row.embedding) }));
        scored.sort((a, b) => b.score - a.score);
        candidateEchoes = scored.slice(0, 5);
      }
    } catch (err) {
      // Fall through to trope-scoped fallback if embedding fails
      await log(`Embedding search failed, falling back to trope-scoped: ${err.message}`);
    }
  }

  // Fallback: use echoes from the matched trope only
  if (!candidateEchoes) {
    const echoes = trope.historical_echoes ?? [];
    if (echoes.length === 0) return null;
    candidateEchoes = echoes.map((e) => ({
      trope_id: trope.id,
      figure: e.figure,
      quote: e.quote,
      context: e.context ?? '',
      source: e.source ?? null,
    }));
  }

  if (candidateEchoes.length === 0) return null;

  const echoList = candidateEchoes
    .map((e, i) => `[${i}] Figure: ${e.figure} | Context: ${e.context ?? ''}\nQuote: "${e.quote}"`)
    .join('\n\n');

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are a forensic rhetorical analyst. A modern authoritarian media quote has been matched to the trope "${trope.theme}".

Modern quote:
"${modernQuote}"

Historical echoes available (may span multiple tropes):
${echoList}

Tasks:
1. Select the historical echo that most closely mirrors the rhetorical logic of the modern quote (not just topic similarity — look for the same emotional appeal or logical structure).
2. Write a concise divergence note (1-2 sentences) explaining how the 2026 language differs from the historical version — e.g. updated vocabulary, shifted framing, new technology references.

Respond with JSON only:
{
  "echo_index": 0,
  "figure": "...",
  "year": "YYYY",
  "quote": "...",
  "context": "...",
  "divergence_note": "..."
}`,
      },
    ],
  });

  const raw = message.content[0].text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const result = JSON.parse(jsonMatch[0]);
  const chosen = candidateEchoes[result.echo_index ?? 0];
  const chosenSource = chosen?.source ?? null;
  return {
    figure: result.figure ?? '',
    year: result.year ?? '',
    quote: result.quote ?? '',
    context: result.context ?? '',
    divergence_note: result.divergence_note ?? '',
    ...(chosenSource && { source: chosenSource }),
  };
}

async function main() {
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    throw new Error('Usage: node scripts/analyze-one-url.mjs <target_url>');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    throw new Error(`Invalid URL: ${targetUrl}`);
  }

  const archive = JSON.parse(await readFile(ARCHIVE_PATH, 'utf8'));

  await log(`fetching url=${targetUrl}`);
  let extraction = await fetchArticleText(targetUrl);
  let quote = pickBestQuote(extraction.text, archive);

  if (isWeakExtraction(extraction.text, quote)) {
    await log(`weak fetch extraction for url=${targetUrl}; attempting puppeteer fallback`);
    const puppeteerExtraction = await fetchArticleTextWithPuppeteer(targetUrl);
    if (puppeteerExtraction) {
      const puppeteerQuote = pickBestQuote(puppeteerExtraction.text, archive);
      if (!isWeakExtraction(puppeteerExtraction.text, puppeteerQuote)) {
        extraction = puppeteerExtraction;
        quote = puppeteerQuote;
        await log(`puppeteer fallback selected for url=${targetUrl}`);
      } else {
        await log(`puppeteer fallback returned weak extraction for url=${targetUrl}`);
      }
    } else {
      await log(`puppeteer unavailable or failed for url=${targetUrl}`);
    }
  }

  let trope, confidence, classificationMethod;

  const claudeResult = await classifyTropeWithClaude(extraction.text, archive).catch(() => null);
  if (claudeResult) {
    trope = claudeResult.trope;
    confidence = Number(Math.min(0.95, claudeResult.confidence).toFixed(2));
    classificationMethod = 'claude';
    await log(`classified url=${targetUrl} trope=${trope?.id ?? 'unclassified'} confidence=${confidence} reasoning="${claudeResult.reasoning}"`);
  } else {
    const keyword = pickTropeFromText(archive, extraction.text);
    trope = keyword.trope;
    const methodConfidenceBoost =
      extraction.extractionMethod === 'jsonld'
        ? 0.15
        : extraction.extractionMethod === 'dom_paragraphs'
          ? 0.08
          : extraction.extractionMethod === 'puppeteer_dom'
            ? 0.12
            : 0;
    confidence = trope
      ? Number(Math.min(0.95, 0.2 + keyword.keywordHits * 0.18 + methodConfidenceBoost).toFixed(2))
      : 0.15;
    classificationMethod = 'keyword';
  }

  if (isBoilerplateQuote(quote)) {
    await log(`skipped boilerplate-quote url=${targetUrl}`);
    return;
  }

  if (claudeResult && !isPropagandaContent(claudeResult)) {
    await log(`skipped non-propaganda url=${targetUrl} theme="${claudeResult.analysis?.theme?.slice(0, 80)}"`);
    return;
  }

  const translationResult = await translateQuoteIfNeeded(quote).catch(async (err) => {
    await log(`translation failed: ${err instanceof Error ? err.message : 'unknown'}`);
    return null;
  });
  if (translationResult) {
    await log(`translated quote from ${translationResult.language} for url=${targetUrl}`);
  }

  let historicalEcho = null;
  if (confidence >= 0.4) {
    historicalEcho = await runHistoricalAnalysis(quote, trope, extraction.text).catch(async (err) => {
      await log(`historical-analysis failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return null;
    });
    if (historicalEcho) {
      await log(`historical-analysis complete figure="${historicalEcho.figure}" url=${targetUrl}`);
    }
  } else {
    await log(`confidence=${confidence} below threshold; skipping historical analysis for url=${targetUrl}`);
  }

  const stamp = nowIso();
  const id = `manual-${safeIdPart(parsedUrl.hostname)}-${Date.now()}`;
  const entry = {
    id,
    timestamp: stamp,
    source: {
      publication: parsedUrl.hostname,
      url: targetUrl
    },
    contemporary_quote: quote,
    ...(translationResult && {
      contemporary_quote_en: translationResult.translation,
      translation_language: translationResult.language,
      translation_service: 'Claude claude-haiku-4-5'
    }),
    historical_parallel: trope?.theme ?? 'Unclassified rhetorical pattern',
    tropes: trope?.id ? [trope.id] : ['unclassified'],
    confidence,
    ...(claudeResult?.analysis && { analysis: claudeResult.analysis }),
    ...(historicalEcho && {
      historical_echo: {
        figure: historicalEcho.figure,
        year: historicalEcho.year,
        quote: historicalEcho.quote,
        context: historicalEcho.context,
        ...(historicalEcho.source && { source: historicalEcho.source }),
      },
      divergence_note: historicalEcho.divergence_note
    }),
    extraction_method: extraction.extractionMethod,
    evidence_snippet: extraction.evidenceSnippet,
    notes:
      `Generated by prioritized extractor (readability -> jsonld -> dom_paragraphs -> fallback_text). Classification: ${classificationMethod}.`
  };

  if (existsByUrlAndQuote(targetUrl, quote)) {
    await log(`skipped duplicate url=${targetUrl}`);
    return;
  }

  insertComparison(entry);
  await log(
    `wrote comparison id=${id} url=${targetUrl} trope=${entry.tropes[0]} confidence=${entry.confidence} method=${entry.extraction_method}`
  );
}

main().catch(async (error) => {
  await log(`failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
