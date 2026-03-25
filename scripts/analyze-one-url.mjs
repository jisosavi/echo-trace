#!/usr/bin/env node
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ARCHIVE_PATH = path.join(ROOT_DIR, 'archival-memory.json');
const COMPARISONS_PATH = path.join(ROOT_DIR, 'web/public/data/comparisons.json');
const LOG_PATH = path.join(ROOT_DIR, 'agent/data/openclaw.log');

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
    await page.waitForTimeout(1500);

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
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `You are a rhetorical analyst. Classify the following article excerpt into exactly one of these propaganda tropes based on its rhetorical function and intent — not just keyword presence.\n\nTropes:\n${tropeList}\n\nIf none fit, use id "unclassified".\n\nRespond with JSON only, no prose:\n{"trope_id": "...", "confidence": 0.0, "reasoning": "..."}\n\nArticle:\n${articleText.slice(0, 3000)}`
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
  return { trope, confidence: Number(result.confidence ?? 0), reasoning: result.reasoning ?? '' };
}

async function runHistoricalAnalysis(modernQuote, trope, articleText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !trope) {
    return null;
  }

  const echoes = trope.historical_echoes ?? [];
  if (echoes.length === 0) {
    return null;
  }

  const echoList = echoes
    .map((e, i) => `[${i}] Figure: ${e.figure} | Context: ${e.context}\nQuote: "${e.quote}"`)
    .join('\n\n');

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are a forensic rhetorical analyst. A modern authoritarian media quote has been matched to the trope "${trope.theme}".

Modern quote:
"${modernQuote}"

Historical echoes available:
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
}`
      }
    ]
  });

  const raw = message.content[0].text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  const result = JSON.parse(jsonMatch[0]);
  return {
    figure: result.figure ?? '',
    year: result.year ?? '',
    quote: result.quote ?? '',
    context: result.context ?? '',
    divergence_note: result.divergence_note ?? ''
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
  const comparisons = JSON.parse(await readFile(COMPARISONS_PATH, 'utf8'));

  if (!Array.isArray(comparisons)) {
    throw new Error('Expected web/public/data/comparisons.json to contain a JSON array.');
  }

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
    historical_parallel: trope?.theme ?? 'Unclassified rhetorical pattern',
    tropes: trope?.id ? [trope.id] : ['unclassified'],
    confidence,
    ...(historicalEcho && {
      historical_echo: {
        figure: historicalEcho.figure,
        year: historicalEcho.year,
        quote: historicalEcho.quote,
        context: historicalEcho.context
      },
      divergence_note: historicalEcho.divergence_note
    }),
    extraction_method: extraction.extractionMethod,
    evidence_snippet: extraction.evidenceSnippet,
    notes:
      `Generated by prioritized extractor (readability -> jsonld -> dom_paragraphs -> fallback_text). Classification: ${classificationMethod}.`
  };

  const isDuplicate = comparisons.some(
    (c) => c.source?.url === targetUrl && c.contemporary_quote === quote
  );
  if (isDuplicate) {
    await log(`skipped duplicate url=${targetUrl}`);
    return;
  }

  comparisons.unshift(entry);
  await writeFile(COMPARISONS_PATH, `${JSON.stringify(comparisons, null, 2)}\n`, 'utf8');
  await log(
    `wrote comparison id=${id} url=${targetUrl} trope=${entry.tropes[0]} confidence=${entry.confidence} method=${entry.extraction_method}`
  );
}

main().catch(async (error) => {
  await log(`failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
