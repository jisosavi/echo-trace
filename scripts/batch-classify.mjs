#!/usr/bin/env node
/**
 * batch-classify.mjs
 * Classifies all cases in eudisinfo-ukraine.json using Claude.
 *
 * Sends BATCH_SIZE titles per API call with prompt caching on the taxonomy
 * system prompt. Saves a checkpoint after every batch — safe to interrupt
 * and resume (already-classified URLs are skipped on restart).
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/batch-classify.mjs [options]
 *
 * Options:
 *   --input <path>      Input JSON  (default: agent/data/eudisinfo-ukraine.json)
 *   --output <path>     Output JSON (default: agent/data/eudisinfo-ukraine-classified.json)
 *   --batch-size <n>    Titles per API call (default: 50)
 *   --model <id>        Claude model  (default: claude-haiku-4-5-20251001)
 *   --delay <ms>        Delay between batches (default: 600)
 *   --limit <n>         Only process first N unclassified cases (for testing)
 *   --concurrency <n>   Parallel API calls (default: 3, max 5)
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const ARCHIVE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'archival-memory.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    input:       path.join(ROOT, 'agent/data/eudisinfo-ukraine.json'),
    output:      path.join(ROOT, 'agent/data/eudisinfo-ukraine-classified.json'),
    batchSize:   50,
    model:       'claude-haiku-4-5-20251001',
    delay:       600,
    limit:       Infinity,
    concurrency: 3,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':       opts.input       = args[++i]; break;
      case '--output':      opts.output      = args[++i]; break;
      case '--batch-size':  opts.batchSize   = parseInt(args[++i], 10); break;
      case '--model':       opts.model       = args[++i]; break;
      case '--delay':       opts.delay       = parseInt(args[++i], 10); break;
      case '--limit':       opts.limit       = parseInt(args[++i], 10); break;
      case '--concurrency': opts.concurrency = Math.min(5, parseInt(args[++i], 10)); break;
    }
  }
  return opts;
}

// ── Taxonomy system prompt (built dynamically from archival-memory.json) ──────

function buildTaxonomySystem(archive) {
  const tropes = archive.rhetorical_tropes ?? [];
  const tropeList = tropes.map((t) => `- ${t.id}: ${t.theme}`).join('\n');

  return `You are a forensic propaganda analyst. You will receive a numbered list of disinformation headlines and classify each one across all dimensions simultaneously.

TROPE IDs — assign exactly one per headline:
${tropeList}
- unclassified: Does not fit any trope

NARRATIVE STRATEGY (Lank & Antai 2025) — one per headline:
- suppression: Diminishes target's status/character through negative portrayal
- destruction: Damages target's military/strategic reliability; portrays as weak and untrustworthy
- direction: Steers behavior via incentives and disincentives toward preferred outcomes
- exploitation: Co-opts third-party narratives by omitting contextual facts

SAN MARTINO TECHNIQUES (Da San Martino et al. 2019) — array, all that apply:
Appeal to Authority, Appeal to Fear/Prejudice, Bandwagon, Black-and-White Fallacy,
Causal Oversimplification, Doubt, Exaggeration/Minimisation, Flag-Waving, Loaded Language,
Name Calling/Labeling, Obfuscation/Vagueness, Red Herring, Repetition, Slogans,
Straw Man, Thought-terminating Clichés, Whataboutism, Smears

IPA TECHNIQUES (Institute for Propaganda Analysis, 1937) — array, all that apply:
Name-calling, Glittering generalities, Transfer, Testimonial, Plain folks, Card stacking, Bandwagon

NIMMO 4D (DFRLab / Ben Nimmo) — one per headline:
- Dismiss: Attacks the messenger, not the claim
- Distort: Fabricates or manipulates facts / rewrites history
- Distract: Redirects via whataboutism or subject-switching
- Dismay: Intimidates via fear, threats, or conspiracy framing

ELLUL TYPE (Ellul 1965) — one per headline:
- agitation: Short-term emotional mobilisation; seeks immediate response
- integration: Long-term worldview normalisation; slow sociological conditioning

ELLUL AXIS (Ellul 1965) — one per headline:
- vertical: State/authority broadcast top-down
- horizontal: Peer-to-peer / grassroots-seeming diffusion

ECO PROPERTIES (Eco "Ur-Fascism" 1995) — array, all that apply:
The Cult of Tradition, The Rejection of Modernism, The Cult of Action for Action's Sake,
Disagreement is Treason, Fear of Difference, Appeal to a Frustrated Middle Class,
Obsession with a Plot, Enemies Too Strong and Too Weak, Pacifism as Enemy Collaboration,
Contempt for the Weak, Education Toward Heroism, Machismo, Selective Populism, Newspeak

EUVSDISINFO NARRATIVES (EUvsDisinfo 6 key pro-Kremlin narratives) — array, all that apply:
- Elites vs People: Shadowy elite blamed for ordinary grievances
- Threatened Values: Russia as defender of tradition vs Western moral decay
- Lost Sovereignty: Target states as puppet regimes of US/NATO/Anglo-Saxons
- Imminent Collapse: Western institutions/economies on verge of breakdown
- Hahaganda: Ridicule and mockery to delegitimise without arguing
- Nazis: Adversaries labelled as Nazis/fascists to justify aggression

EUVSDISINFO RHETORIC / SWAMPED — array, all that apply:
Straw Man, Whataboutism, Attack, Mockery, Provocations, Exhaust, Denial

EUVSDISINFO CONSPIRACY — array, all that apply:
Shadow Government / Deep State, Rothschilds / Banker Conspiracy, Protocols / Jewish Plot,
Soros Conspiracy, Anglo-Saxon Plot, Color Revolution Conspiracy, Climate Hoax,
Big Pharma / Vaccine Conspiracy, Gay / LGBTQ Lobby, False Flag

DISARM TTPs (content-detectable only) — array, all that apply:
Fabricated Content, Manipulated Content, False Attribution, False Context,
Fake Experts, Forced Confessions, Video/Image Manipulation, Infoshum,
Firehose of Falsehood, Conspiracy Amplification, Narrative Laundering,
Data Void Exploitation, Strategic Decontextualization, Impersonation, Emotional Manipulation

Respond with a JSON array — one object per headline in the same order, no prose:
[
  {
    "i": 1,
    "trope_id": "...",
    "confidence": 0.0,
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
]`;
}

// ── API call for one batch ────────────────────────────────────────────────────

async function classifyBatch(client, model, taxonomySystem, items) {
  const numbered = items
    .map((item, idx) => `[${idx + 1}] ${item.title}`)
    .join('\n');

  const msg = await client.messages.create({
    model,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: taxonomySystem,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Classify these ${items.length} disinformation headlines:\n\n${numbered}`,
      },
    ],
  });

  const raw = msg.content[0].text.trim();
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`No JSON array in response: ${raw.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]);
}

// ── Merge classification result onto original case object ─────────────────────

function mergeCaseResult(original, result) {
  return {
    ...original,
    analysis: {
      trope_id:               result.trope_id             ?? 'unclassified',
      confidence:             Number((result.confidence   ?? 0).toFixed(2)),
      narrative_strategy:     result.narrative_strategy   ?? '',
      san_martino_techniques: result.san_martino_techniques ?? [],
      ipa_techniques:         result.ipa_techniques        ?? [],
      nimmo_4d:               result.nimmo_4d              ?? '',
      ellul_type:             result.ellul_type             ?? '',
      ellul_axis:             result.ellul_axis             ?? '',
      eco_properties:         result.eco_properties         ?? [],
      eudisinfo_narratives:   result.eudisinfo_narratives   ?? [],
      eudisinfo_rhetoric:     result.eudisinfo_rhetoric     ?? [],
      eudisinfo_conspiracy:   result.eudisinfo_conspiracy   ?? [],
      eudisinfo_ttp:          result.eudisinfo_ttp           ?? [],
    },
    classified_at: new Date().toISOString(),
  };
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function pLimit(concurrency, tasks) {
  const results = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  // Load archive and build taxonomy prompt
  const archive = JSON.parse(await readFile(ARCHIVE_PATH, 'utf8'));
  const taxonomySystem = buildTaxonomySystem(archive);
  console.log(`Loaded ${archive.rhetorical_tropes.length} tropes from archival-memory.json`);

  // Load input
  const allCases = JSON.parse(await readFile(opts.input, 'utf8'));
  console.log(`Loaded ${allCases.length} cases from ${opts.input}`);

  // Load existing output for resume (keyed by URL)
  let classified = [];
  const doneUrls = new Set();
  try {
    classified = JSON.parse(await readFile(opts.output, 'utf8'));
    for (const c of classified) if (c.url) doneUrls.add(c.url);
    console.log(`Resuming: ${doneUrls.size} already classified`);
  } catch {
    console.log('No existing output — starting fresh');
  }

  // Filter to unclassified cases
  let pending = allCases.filter((c) => !doneUrls.has(c.url));
  if (opts.limit < Infinity) pending = pending.slice(0, opts.limit);
  console.log(`${pending.length} cases to classify | model: ${opts.model} | batch: ${opts.batchSize} | concurrency: ${opts.concurrency}\n`);

  if (pending.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Split into batches
  const batches = [];
  for (let i = 0; i < pending.length; i += opts.batchSize) {
    batches.push(pending.slice(i, i + opts.batchSize));
  }

  let totalDone = doneUrls.size;
  let batchIdx = 0;

  // Process batches with controlled concurrency
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  for (let start = 0; start < batches.length; start += opts.concurrency) {
    const chunk = batches.slice(start, start + opts.concurrency);

    const tasks = chunk.map((batch, chunkOffset) => async () => {
      const batchNum = start + chunkOffset + 1;
      const attempt = async (retries = 3) => {
        try {
          return await classifyBatch(client, opts.model, taxonomySystem, batch);
        } catch (err) {
          if (retries > 0 && (err.status === 529 || err.status === 500 || err.message?.includes('overloaded'))) {
            const wait = (4 - retries) * 8000;
            console.log(`  [batch ${batchNum}] retrying in ${wait / 1000}s (${err.message})`);
            await delay(wait);
            return attempt(retries - 1);
          }
          throw err;
        }
      };
      return { batch, batchNum, results: await attempt() };
    });

    const settled = await pLimit(opts.concurrency, tasks);

    // Merge results in order
    for (const { batch, batchNum, results } of settled) {
      const newEntries = [];
      for (let i = 0; i < batch.length; i++) {
        const res = results.find((r) => r.i === i + 1) ?? results[i];
        if (!res) {
          console.warn(`  [batch ${batchNum}] missing result for item ${i + 1}, storing unclassified`);
          newEntries.push({ ...batch[i], analysis: { trope_id: 'unclassified', confidence: 0 }, classified_at: new Date().toISOString() });
        } else {
          newEntries.push(mergeCaseResult(batch[i], res));
        }
      }
      classified.push(...newEntries);
      totalDone += newEntries.length;

      const pct = ((totalDone / allCases.length) * 100).toFixed(1);
      console.log(`[batch ${batchNum}/${batches.length}] +${newEntries.length} → ${totalDone} total (${pct}%)`);
    }

    // Checkpoint save after every concurrency-chunk
    await writeFile(opts.output, JSON.stringify(classified, null, 2) + '\n', 'utf8');

    if (start + opts.concurrency < batches.length) {
      await delay(opts.delay);
    }
  }

  console.log(`\nDone. ${classified.length} classified cases saved to ${opts.output}`);

  // Print trope distribution
  const tropeCounts = {};
  for (const c of classified) {
    const t = c.analysis?.trope_id ?? 'unclassified';
    tropeCounts[t] = (tropeCounts[t] ?? 0) + 1;
  }
  console.log('\nTrope distribution:');
  for (const [trope, count] of Object.entries(tropeCounts).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.round((count / classified.length) * 40));
    console.log(`  ${trope.padEnd(24)} ${String(count).padStart(5)}  ${bar}`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
