#!/usr/bin/env node
/**
 * Precomputes Voyage AI embeddings for all historical_echoes in archival-memory.json
 * and stores them in the echo_embeddings SQLite table.
 *
 * Run once (or after adding new echoes):
 *   VOYAGE_API_KEY=<key> node scripts/precompute-embeddings.mjs
 *
 * Idempotent: existing echo_key rows are updated in-place, not duplicated.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getDb, upsertEchoEmbedding } from './db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ARCHIVE_PATH = path.join(ROOT_DIR, 'archival-memory.json');

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
if (!VOYAGE_API_KEY) {
  console.error('Error: VOYAGE_API_KEY environment variable is required.');
  process.exit(1);
}

const VOYAGE_MODEL = 'voyage-3-lite';
const VOYAGE_BATCH = 128; // max inputs per request

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function echoKey(trope_id, figure, quote) {
  const hash = createHash('sha1').update(quote).digest('hex').slice(0, 8);
  return `${trope_id}:${slugify(figure)}:${hash}`;
}

async function embedBatch(texts) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: VOYAGE_MODEL, input: texts }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage API error ${res.status}: ${body}`);
  }
  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

async function main() {
  const archive = JSON.parse(await readFile(ARCHIVE_PATH, 'utf8'));
  getDb(); // ensure tables are created

  // Collect all echoes
  const echoes = [];
  for (const trope of archive.rhetorical_tropes) {
    for (const echo of trope.historical_echoes ?? []) {
      echoes.push({
        echo_key: echoKey(trope.id, echo.figure, echo.quote),
        trope_id: trope.id,
        figure: echo.figure,
        quote: echo.quote,
        context: echo.context ?? null,
        source: echo.source ?? null,
      });
    }
  }

  console.log(`Found ${echoes.length} historical echoes across ${archive.rhetorical_tropes.length} tropes.`);

  // Embed in batches
  let embedded = 0;
  for (let i = 0; i < echoes.length; i += VOYAGE_BATCH) {
    const batch = echoes.slice(i, i + VOYAGE_BATCH);
    const texts = batch.map((e) => `${e.figure}: ${e.quote}`);
    console.log(`Embedding batch ${Math.floor(i / VOYAGE_BATCH) + 1} (${batch.length} items)...`);
    const embeddings = await embedBatch(texts);
    for (let j = 0; j < batch.length; j++) {
      upsertEchoEmbedding({ ...batch[j], embedding: embeddings[j] });
    }
    embedded += batch.length;
    console.log(`  Stored ${embedded}/${echoes.length}`);
  }

  console.log(`Done. ${embedded} echo embeddings stored in SQLite.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
