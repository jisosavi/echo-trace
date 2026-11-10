#!/usr/bin/env node
/**
 * calibrate-threshold.mjs — choose ECHO_MIN_SIMILARITY from the control corpus.
 *
 * For every analysed article the pipeline stores top_similarity: the cosine
 * between its key claim and the nearest archive echo, computed before any
 * propaganda judgement. This script shows, per corpus, the share of articles
 * whose nearest echo clears each threshold, and recommends the lowest threshold
 * at which the control corpus stays at or below the target rate.
 *
 * Usage: node scripts/calibrate-threshold.mjs [--target 0.10]
 */
import { getDb } from './db.mjs';
import { MIN_SIMILARITY } from './lib/analyze.mjs';

const args = process.argv.slice(2);
const target = args.includes('--target') ? Number(args[args.indexOf('--target') + 1]) : 0.1;

const db = getDb();
const rows = db.prepare(`
  SELECT corpus, top_similarity AS s, outcome, is_propaganda
  FROM articles
  WHERE top_similarity IS NOT NULL AND prompt_version IS NOT NULL
`).all();

const byCorpus = { state: rows.filter((r) => r.corpus === 'state'), control: rows.filter((r) => r.corpus === 'control') };
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—').padStart(7);

console.log(`Analysed articles with similarity: state=${byCorpus.state.length} control=${byCorpus.control.length}`);
console.log(`Current ECHO_MIN_SIMILARITY = ${MIN_SIMILARITY}\n`);

console.log('Pipeline outcomes (current settings):');
for (const [corpus, list] of Object.entries(byCorpus)) {
  const n = list.length;
  const count = (o) => list.filter((r) => r.outcome === o).length;
  console.log(`  ${corpus.padEnd(8)} n=${String(n).padStart(4)}  propaganda ${pct(list.filter((r) => r.is_propaganda).length, n)}  echo ${pct(count('echo'), n)}  no_echo ${pct(count('no_echo'), n)}`);
}

console.log('\nShare of articles whose nearest echo is ≥ threshold (independent of the classifier):');
console.log('  threshold    state  control   gap');
let recommended = null;
for (let t = 0.3; t <= 0.701; t += 0.025) {
  const s = byCorpus.state.filter((r) => r.s >= t).length / (byCorpus.state.length || 1);
  const c = byCorpus.control.filter((r) => r.s >= t).length / (byCorpus.control.length || 1);
  if (recommended === null && byCorpus.control.length && c <= target) recommended = t;
  console.log(`  ${t.toFixed(3).padStart(9)}  ${pct(s * byCorpus.state.length, byCorpus.state.length)}  ${pct(c * byCorpus.control.length, byCorpus.control.length)}  ${((s - c) * 100).toFixed(1).padStart(5)} pt`);
}

if (byCorpus.control.length < 30) {
  console.log(`\nOnly ${byCorpus.control.length} control articles — collect at least 30 (better 100+) before trusting a recommendation.`);
} else if (recommended !== null) {
  console.log(`\nRecommended: ECHO_MIN_SIMILARITY=${recommended.toFixed(3)} (control ≤ ${(target * 100).toFixed(0)}%). Set it in .env.`);
} else {
  console.log(`\nNo threshold in range keeps control ≤ ${(target * 100).toFixed(0)}%.`);
}
