#!/usr/bin/env node
/**
 * analyze-new.mjs
 * Analyses every pending article in the database (plus failed ones with
 * retries left), in one process. Called by cycle.sh after scraping.
 *
 * Usage: node scripts/analyze-new.mjs [--limit <n>] [--corpus state|control] [--dry-run]
 */
import { getPendingArticles } from './db.mjs';
import { createContext, analyzeArticle } from './lib/analyze.mjs';
import { closeBrowser } from './lib/extract.mjs';
import { makeLogger } from './lib/log.mjs';

const log = makeLogger('analyze');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: 1e9, corpus: null, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit': opts.limit = parseInt(args[++i], 10); break;
      case '--corpus': opts.corpus = args[++i]; break;
      case '--dry-run': opts.dryRun = true; break;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const pending = getPendingArticles(opts.limit, opts.corpus);
  console.log(`Pending articles: ${pending.length}`);
  if (opts.dryRun) {
    for (const a of pending) console.log(`  [${a.corpus}] ${a.source} — ${a.url}`);
    return;
  }
  if (pending.length === 0) return;

  const ctx = createContext();
  if (ctx.embeddingWarning) log(`WARNING ${ctx.embeddingWarning}`);

  const tally = {};
  for (const article of pending) {
    const outcome = await analyzeArticle(article, ctx, log);
    tally[outcome] = (tally[outcome] ?? 0) + 1;
  }
  const summary = Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' ');
  log(`analysis batch complete ${summary}`);
  console.log(summary);
  if (tally.error) process.exitCode = 2;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeBrowser);
