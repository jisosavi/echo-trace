#!/usr/bin/env node
/**
 * analyze-new.mjs
 * Reads agent/data/raw-news.json, compares against already-analyzed URLs in
 * web/public/data/comparisons.json, and runs analyze-one-url.mjs on each new URL.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/analyze-new.mjs [options]
 *
 * Options:
 *   --limit <n>     Max URLs to process in this run (default: all)
 *   --delay <ms>    Delay between analyses (default: 2000)
 *   --dry-run       Print URLs that would be analyzed, without running
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const RAW_NEWS_PATH    = path.join(ROOT, 'agent/data/raw-news.json');
const COMPARISONS_PATH = path.join(ROOT, 'web/public/data/comparisons.json');
const ANALYZER         = path.join(ROOT, 'scripts/analyze-one-url.mjs');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: Infinity, delay: 2000, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit':   opts.limit  = parseInt(args[++i], 10); break;
      case '--delay':   opts.delay  = parseInt(args[++i], 10); break;
      case '--dry-run': opts.dryRun = true; break;
    }
  }
  return opts;
}

async function readJson(filePath) {
  if (!existsSync(filePath)) return [];
  try { return JSON.parse(await readFile(filePath, 'utf8')); } catch { return []; }
}

function runAnalyzer(url) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [ANALYZER, url], {
      stdio: 'inherit',
      env: { ...process.env }
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`analyze-one-url exited with code ${code} for ${url}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  const opts = parseArgs();

  if (!process.env.ANTHROPIC_API_KEY && !opts.dryRun) {
    console.error('Error: ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const rawNews    = await readJson(RAW_NEWS_PATH);
  const comparisons = await readJson(COMPARISONS_PATH);

  if (rawNews.length === 0) {
    console.log('No scraped articles found in raw-news.json. Run scrape-news.mjs first.');
    return;
  }

  // Build set of already-analyzed URLs
  const analyzedUrls = new Set(comparisons.map((c) => c.source?.url).filter(Boolean));

  // Filter to real news URLs not yet analyzed
  const pending = rawNews
    .filter((r) => r.url && !analyzedUrls.has(r.url))
    .slice(0, opts.limit);

  console.log(`raw-news.json: ${rawNews.length} articles`);
  console.log(`Already analyzed: ${analyzedUrls.size}`);
  console.log(`Pending: ${pending.length}${opts.limit < Infinity ? ` (capped at ${opts.limit})` : ''}\n`);

  if (pending.length === 0) {
    console.log('Nothing new to analyze.');
    return;
  }

  if (opts.dryRun) {
    console.log('Dry run — would analyze:');
    pending.forEach((r) => console.log(`  [${r.source}] ${r.url}`));
    return;
  }

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  let done = 0;
  let failed = 0;

  for (const record of pending) {
    console.log(`[${done + 1}/${pending.length}] ${record.source} — ${record.url}`);
    try {
      await runAnalyzer(record.url);
      done++;
    } catch (err) {
      console.error(`  Failed: ${err.message}`);
      failed++;
    }
    if (done + failed < pending.length) await delay(opts.delay);
  }

  console.log(`\nDone. Analyzed: ${done}  Failed: ${failed}`);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
