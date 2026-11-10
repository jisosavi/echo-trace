#!/usr/bin/env node
/**
 * check-archive.mjs — automated citation check for archival-memory.json.
 *
 * For every echo: fetch its source URL and test whether the quote text appears
 * on the page (word 6-gram overlap). Writes the result to verification.auto and
 * produces a worklist for manual verification at agent/data/archive-worklist.md.
 *
 * The automated check never sets verification.status — that is a human decision,
 * recorded with scripts/verify-echo.mjs.
 *
 * Usage: node scripts/check-archive.mjs [--offline]   (--offline: only normalise + rewrite worklist)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadArchive, saveArchive, normalizeArchive, listEchoes, normForMatch, shingleOverlap } from './lib/archive.mjs';
import { getDb } from './db.mjs';
import { DATA_DIR } from './lib/log.mjs';
import { randomUserAgent } from './lib/extract.mjs';

const WORKLIST_PATH = path.join(DATA_DIR, 'archive-worklist.md');

/** Landing pages, collections and search results are not citations of a specific text. */
function looksGeneric(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    return (
      segs.length <= 1 ||
      /search|query=/.test(u.pathname + u.search) ||
      /\/(collection|collections|location|africa|themes|cuba|en)\/?[^/]*\/?$/.test(u.pathname) && segs.length <= 3
    );
  } catch {
    return true;
  }
}

async function checkOne(echo) {
  const url = echo.source?.url;
  const auto = { checked_at: new Date().toISOString(), http_status: null, match: 'no_url', score: 0, generic_url: false };
  if (!url) return auto;
  auto.generic_url = looksGeneric(url);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': randomUserAgent(), Accept: 'text/html,*/*' },
    });
    auto.http_status = res.status;
    if (!res.ok) { auto.match = 'unreachable'; return auto; }
    const type = res.headers.get('content-type') ?? '';
    if (!/html|text|xml/.test(type)) { auto.match = 'not_text'; return auto; }
    const body = (await res.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
    if (normForMatch(body).includes(normForMatch(echo.quote))) { auto.match = 'full'; auto.score = 1; return auto; }
    auto.score = Number(shingleOverlap(echo.quote, body).toFixed(2));
    auto.match = auto.score >= 0.3 ? 'partial' : 'none';
  } catch (err) {
    auto.match = 'unreachable';
    auto.error = err?.name ?? 'error';
  }
  return auto;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

function usageCounts() {
  try {
    const rows = getDb().prepare(`SELECT echo_id, COUNT(*) n FROM comparisons WHERE echo_id IS NOT NULL AND hidden = 0 GROUP BY echo_id`).all();
    return new Map(rows.map((r) => [r.echo_id, r.n]));
  } catch {
    return new Map();
  }
}

const MATCH_ORDER = ['full', 'partial', 'none', 'not_text', 'unreachable', 'no_url'];
const MATCH_LABEL = {
  full: 'Quote found word-for-word at the URL — confirm and mark verified',
  partial: 'Quote partly found (often a different translation) — check wording',
  none: 'Page loads but quote not found — find the real source or reject',
  not_text: 'PDF or non-HTML source — check by hand',
  unreachable: 'URL broken / blocked — find a working source or reject',
  no_url: 'No URL',
};

function writeWorklist(echoes, uses) {
  const open = echoes.filter((e) => ['unverified', 'paraphrase'].includes(e.verification.status));
  const done = echoes.length - open.length;
  const statusCounts = echoes.reduce((m, e) => ((m[e.verification.status] = (m[e.verification.status] ?? 0) + 1), m), {});
  const lines = [
    '# Archive verification worklist',
    '',
    `Generated ${new Date().toISOString()} by \`scripts/check-archive.mjs\`. ${done}/${echoes.length} echoes have a final status.`,
    '',
    `Status: ${Object.entries(statusCounts).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
    '',
    'Record a decision:',
    '',
    '```bash',
    'node scripts/verify-echo.mjs <id> verified    "Calvin GPA, para 4"',
    'node scripts/verify-echo.mjs <id> translation "Own translation of Italian original, Opera Omnia vol. 21 p. 362"',
    'node scripts/verify-echo.mjs <id> paraphrase  "Common paraphrase; no primary text found"',
    'node scripts/verify-echo.mjs <id> rejected    "Not sourceable"',
    '# fix wording / source at the same time:',
    'node scripts/verify-echo.mjs <id> verified "…" --quote "exact text" --url https://… --citation "…" --year 1937',
    '```',
    '',
    'Then run `node scripts/precompute-embeddings.mjs` to refresh the match index.',
    '',
    'Within each group, echoes used most often in published comparisons come first.',
  ];
  for (const match of MATCH_ORDER) {
    const group = open
      .filter((e) => (e.verification.auto?.match ?? 'no_url') === match)
      .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0));
    if (group.length === 0) continue;
    lines.push('', `## ${MATCH_LABEL[match]} (${group.length})`);
    for (const e of group) {
      const a = e.verification.auto ?? {};
      lines.push(
        '',
        `### ${e.figure}${e.year ? `, ${e.year}` : ''}`,
        '',
        `- **id:** \`${e.id}\``,
        `- **trope:** ${e.trope_id} · **used in:** ${uses.get(e.id) ?? 0} comparisons · **status:** ${e.verification.status}`,
        `- **context:** ${e.context ?? ''}`,
        `- **citation:** ${e.source?.citation ?? '—'}`,
        `- **url:** ${e.source?.url ?? '—'} (HTTP ${a.http_status ?? '—'}${a.score ? `, overlap ${a.score}` : ''}${a.generic_url ? ', ⚠ generic landing/search page' : ''})`,
        '',
        `> ${e.quote}`,
      );
    }
  }
  writeFileSync(WORKLIST_PATH, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const offline = process.argv.includes('--offline');
  const { archive } = loadArchive();
  const normalized = normalizeArchive(archive);
  if (normalized) console.log(`Normalised ${normalized} echoes (id / year / verification).`);

  const echoes = listEchoes(archive);
  if (!offline) {
    console.log(`Checking ${echoes.length} source URLs…`);
    const results = await pool(echoes, 6, checkOne);
    const byId = new Map(echoes.map((e, i) => [e.id, results[i]]));
    for (const trope of archive.rhetorical_tropes) {
      for (const echo of trope.historical_echoes) echo.verification.auto = byId.get(echo.id);
    }
    const tally = results.reduce((m, r) => ((m[r.match] = (m[r.match] ?? 0) + 1), m), {});
    console.log(Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' '));
  }
  saveArchive(archive);
  writeWorklist(listEchoes(archive), usageCounts());
  console.log(`Worklist: ${WORKLIST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
