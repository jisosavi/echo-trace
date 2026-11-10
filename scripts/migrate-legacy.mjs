#!/usr/bin/env node
/**
 * migrate-legacy.mjs — one-time migration to the v3 data model. Idempotent.
 *
 *  1. Backs up the database (agent/data/echo-trace.db.bak-<timestamp>).
 *  2. Normalises the archive (stable echo ids, year, verification block).
 *  3. Imports agent/data/raw-news.json into the articles table as status=legacy
 *     (kept for history, never re-analysed, excluded from baseline statistics).
 *  4. Links existing comparisons to archive echo ids and replaces their stored
 *     historical quote/figure/year/context/source with the archive's text
 *     (older entries had LLM-retyped quotes and LLM-generated years).
 *  5. Hides (hidden=1, reversible) comparisons from outlets no longer monitored
 *     and legacy rows that were never classified.
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, DB_PATH, insertArticle } from './db.mjs';
import { loadArchive, normalizeArchive, saveArchive, listEchoes, normForMatch, shingleOverlap } from './lib/archive.mjs';
import { sourceForUrl } from './sources.mjs';
import { DATA_DIR } from './lib/log.mjs';

const db = getDb();

// 1. Backup
const backup = `${DB_PATH}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
db.pragma('wal_checkpoint(TRUNCATE)');
copyFileSync(DB_PATH, backup);
console.log(`Backup: ${backup}`);

// 2. Archive
const { archive } = loadArchive();
const changed = normalizeArchive(archive);
if (changed) { saveArchive(archive); console.log(`Archive: normalised ${changed} echoes.`); }
const echoes = listEchoes(archive);

// 3. raw-news.json → articles (legacy)
const rawPath = path.join(DATA_DIR, 'raw-news.json');
if (existsSync(rawPath)) {
  const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
  let imported = 0;
  const tx = db.transaction(() => {
    for (const r of raw) {
      if (!r.url) continue;
      const src = sourceForUrl(r.url);
      const res = insertArticle({
        url: r.url,
        source: r.source,
        regime: r.regime,
        corpus: src?.corpus ?? 'state',
        language: r.language,
        title: r.title,
        published_at: r.published_at || null,
        retrieved_at: r.retrieved_at ?? new Date(0).toISOString(),
        body: r.body,
        extraction_method: 'legacy_scraper',
        status: 'legacy',
      });
      imported += res.changes;
    }
  });
  tx();
  console.log(`Articles: imported ${imported} legacy records from raw-news.json.`);
}

// 4. Link comparisons to archive echoes
function findEcho(stored) {
  const q = normForMatch(stored.quote);
  let exact = echoes.find((e) => normForMatch(e.quote) === q);
  if (exact) return exact;
  let best = null, bestScore = 0;
  for (const e of echoes) {
    const score = shingleOverlap(e.quote, stored.quote, 4);
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return bestScore >= 0.6 ? best : null;
}

const rows = db.prepare(`SELECT id, historical_echo, echo_id FROM comparisons WHERE historical_echo IS NOT NULL`).all();
const upd = db.prepare(`UPDATE comparisons SET echo_id = ?, historical_echo = ? WHERE id = ?`);
let linked = 0, repaired = 0, unmatched = 0;
for (const row of rows) {
  const stored = JSON.parse(row.historical_echo);
  const e = row.echo_id ? echoes.find((x) => x.id === row.echo_id) : findEcho(stored);
  if (!e) { unmatched++; continue; }
  const canonical = { id: e.id, figure: e.figure, year: e.year ?? '', quote: e.quote, context: e.context ?? '', ...(e.source && { source: e.source }) };
  if (stored.quote !== e.quote) repaired++;
  upd.run(e.id, JSON.stringify(canonical), row.id);
  linked++;
}
console.log(`Comparisons: linked ${linked} to archive echoes (${repaired} quotes corrected to archive text), ${unmatched} unmatched.`);

// Back-fill links between legacy articles and their comparisons.
db.exec(`
  UPDATE articles SET comparison_id = (SELECT c.id FROM comparisons c WHERE c.source_url = articles.url LIMIT 1)
  WHERE comparison_id IS NULL AND status = 'legacy';
  UPDATE comparisons SET outcome = CASE WHEN historical_echo IS NOT NULL THEN 'echo' ELSE 'no_echo' END,
                         prompt_version = 'legacy'
  WHERE prompt_version IS NULL;
`);

// 5. Hide entries from dropped outlets and never-classified legacy rows
const all = db.prepare(`SELECT id, source_url, tropes, prompt_version FROM comparisons WHERE hidden = 0`).all();
const hide = db.prepare(`UPDATE comparisons SET hidden = 1, notes = COALESCE(notes, '') || ? WHERE id = ?`);
let hiddenDropped = 0, hiddenUnclassified = 0;
for (const c of all) {
  if (!c.source_url || !sourceForUrl(c.source_url)) {
    hide.run(' [hidden: outlet no longer monitored]', c.id); hiddenDropped++;
  } else if (c.prompt_version === 'legacy' && (c.tropes ?? '').includes('unclassified')) {
    hide.run(' [hidden: legacy entry, never classified]', c.id); hiddenUnclassified++;
  }
}
console.log(`Hidden: ${hiddenDropped} from dropped outlets, ${hiddenUnclassified} unclassified legacy entries.`);
const visible = db.prepare(`SELECT COUNT(*) n FROM comparisons WHERE hidden = 0`).get().n;
console.log(`Visible comparisons now: ${visible}`);
