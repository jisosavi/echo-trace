#!/usr/bin/env node
/**
 * precompute-embeddings.mjs — embed every usable archive echo with Voyage AI.
 *
 * Re-run after editing archival-memory.json. Only new or changed quotes (or a
 * changed VOYAGE_MODEL) are re-embedded; rows for removed or rejected echoes
 * are deleted. Use --all to re-embed everything.
 */
import { getAllEchoEmbeddings, upsertEchoEmbedding, deleteEchoEmbeddingsExcept, getDb } from './db.mjs';
import { loadArchive, normalizeArchive, saveArchive, usableEchoes, sha1 } from './lib/archive.mjs';
import { embed, hasVoyage, VOYAGE_MODEL } from './lib/embed.mjs';

async function main() {
  if (!hasVoyage()) {
    console.error('Error: VOYAGE_API_KEY is required.');
    process.exit(1);
  }
  const all = process.argv.includes('--all');
  const { archive } = loadArchive();
  if (normalizeArchive(archive) > 0) {
    saveArchive(archive);
    console.log('Archive normalised (ids / year / verification fields added).');
  }
  getDb();

  const echoes = usableEchoes(archive);
  const existing = new Map(getAllEchoEmbeddings().map((r) => [r.echo_key, r]));
  const todo = echoes.filter((e) => {
    const row = existing.get(e.id);
    return all || !row || row.model !== VOYAGE_MODEL || row.quote_hash !== sha1(e.quote);
  });

  console.log(`${echoes.length} usable echoes; ${todo.length} to embed with ${VOYAGE_MODEL}.`);
  if (todo.length > 0) {
    const vectors = await embed(todo.map((e) => e.quote), 'document');
    todo.forEach((e, i) => upsertEchoEmbedding({
      echo_key: e.id,
      trope_id: e.trope_id,
      figure: e.figure,
      quote: e.quote,
      context: e.context,
      source: e.source,
      embedding: vectors[i],
      model: VOYAGE_MODEL,
      quote_hash: sha1(e.quote),
    }));
  }
  const removed = deleteEchoEmbeddingsExcept(echoes.map((e) => e.id));
  console.log(`Done. Embedded ${todo.length}, removed ${removed} stale rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
