#!/usr/bin/env node
/**
 * analyze-one-url.mjs — analyse a single URL (manual use / debugging).
 *
 * If the URL is not yet in the articles table it is fetched and stored first,
 * using the matching source's settings (corpus, language, renderJs).
 * Use --force to re-analyse an article that was already processed.
 *
 * Usage: node scripts/analyze-one-url.mjs <url> [--force] [--corpus state|control]
 */
import { getArticleByUrl, insertArticle, updateArticle } from './db.mjs';
import { createContext, analyzeArticle } from './lib/analyze.mjs';
import { extractArticle, closeBrowser } from './lib/extract.mjs';
import { sourceForUrl } from './sources.mjs';
import { makeLogger } from './lib/log.mjs';

const log = makeLogger('analyze-one-url');

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => /^https?:\/\//.test(a));
  if (!url) throw new Error('Usage: node scripts/analyze-one-url.mjs <url> [--force] [--corpus state|control]');
  const force = args.includes('--force');
  const corpusArg = args.includes('--corpus') ? args[args.indexOf('--corpus') + 1] : null;

  let article = getArticleByUrl(url);
  if (!article) {
    const src = sourceForUrl(url);
    const ex = await extractArticle(url, { renderJs: !!src?.renderJs, timeout: src?.timeout });
    insertArticle({
      url,
      source: src?.name ?? new URL(url).hostname,
      regime: src?.regime ?? null,
      corpus: corpusArg ?? src?.corpus ?? 'state',
      language: src?.language ?? null,
      title: ex.title,
      published_at: ex.published_at,
      body: ex.text,
      extraction_method: ex.method,
    });
    article = getArticleByUrl(url);
  } else if (article.status === 'done' && !force) {
    console.log(`Already analysed (outcome=${article.outcome}). Use --force to re-run.`);
    return;
  }
  if (force) updateArticle(article.id, { status: 'pending', attempts: 0 });

  const ctx = createContext();
  if (ctx.embeddingWarning) console.warn(`WARNING ${ctx.embeddingWarning}`);
  const outcome = await analyzeArticle({ ...article, attempts: force ? 0 : article.attempts }, ctx, log);
  console.log(`outcome=${outcome}`);
  if (outcome === 'error') process.exitCode = 1;
}

main()
  .catch((err) => {
    log(`failed: ${err instanceof Error ? err.message : err}`);
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeBrowser);
