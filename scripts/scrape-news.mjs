#!/usr/bin/env node
/**
 * scrape-news.mjs
 * Discovers new article URLs from every source in sources.mjs, extracts the
 * article text once, and stores it in the `articles` table (status=pending).
 * Analysis happens later in analyze-new.mjs.
 *
 * Prints the new article URLs to stdout (one per line).
 *
 * Usage: node scripts/scrape-news.mjs [options]
 *   --source <name>    only sources whose name contains <name>
 *   --regime <name>    only sources whose regime contains <name>
 *   --corpus <c>       state | control
 *   --limit <n>        max new articles in total
 */
import * as cheerio from 'cheerio';
import { SOURCES } from './sources.mjs';
import { articleExists, insertArticle } from './db.mjs';
import { extractArticle, fetchHtml, getBrowser, closeBrowser, randomUserAgent, MIN_BODY_CHARS } from './lib/extract.mjs';
import { makeLogger, errMsg } from './lib/log.mjs';

const log = makeLogger('scrape-news');

const sleep = (min, max) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&#38;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function cleanUrl(href, source) {
  let url = decodeEntities(href.trim());
  if (source.stripQuery) url = url.split(/[?#]/)[0];
  return url;
}

// ── URL discovery ────────────────────────────────────────────────────────────

async function discoverFromRss(source) {
  const xml = await fetchHtml(source.rssUrl, source.timeout);
  const urls = [];
  const linkPattern = /<link>\s*(?:<!\[CDATA\[)?\s*(https?[^<\]]+?)\s*(?:\]\]>)?\s*<\/link>/g;
  let m;
  while ((m = linkPattern.exec(xml)) !== null) {
    const url = cleanUrl(m[1], source);
    if (source.articlePattern.test(url)) urls.push(url);
  }
  return [...new Set(urls)];
}

async function discoverWithFetch(source) {
  let frontPage = source.frontPage;
  let html;
  try {
    html = await fetchHtml(frontPage, source.timeout);
  } catch (err) {
    if (!(source.httpsFallbackToHttp && frontPage.startsWith('https://'))) throw err;
    frontPage = frontPage.replace('https://', 'http://');
    log(`https failed for ${source.name} (${errMsg(err)}); retrying with http`);
    html = await fetchHtml(frontPage, source.timeout);
  }
  const $ = cheerio.load(html);
  const hrefs = new Set();
  $('a[href]').each((_, el) => {
    try {
      const url = cleanUrl(new URL($(el).attr('href') || '', frontPage).href, source);
      if (source.articlePattern.test(url)) hrefs.add(url);
    } catch { /* malformed href */ }
  });
  return [...hrefs];
}

async function discoverWithPuppeteer(source) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(randomUserAgent());
    await page.goto(source.frontPage, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1500, 2500);
    const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map((a) => a.href));
    return [...new Set(hrefs.map((h) => cleanUrl(h, source)))].filter((h) => source.articlePattern.test(h));
  } finally {
    await page.close();
  }
}

async function discover(source) {
  if (source.rssUrl) return discoverFromRss(source);
  if (source.renderJs) return discoverWithPuppeteer(source);
  const urls = await discoverWithFetch(source);
  if (urls.length >= 2) return urls;
  log(`fetch returned ${urls.length} links source=${source.name}; trying puppeteer fallback`);
  return discoverWithPuppeteer(source);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: null, regime: null, corpus: null, limit: Infinity };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i].toLowerCase(); break;
      case '--regime': opts.regime = args[++i].toLowerCase(); break;
      case '--corpus': opts.corpus = args[++i].toLowerCase(); break;
      case '--limit': opts.limit = parseInt(args[++i], 10); break;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  let sources = SOURCES;
  if (opts.source) sources = sources.filter((s) => s.name.toLowerCase().includes(opts.source));
  if (opts.regime) sources = sources.filter((s) => s.regime.toLowerCase().includes(opts.regime));
  if (opts.corpus) sources = sources.filter((s) => s.corpus === opts.corpus);
  if (sources.length === 0) {
    console.error(`No sources matched. Available: ${SOURCES.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }

  log(`scrape cycle started sources=${sources.map((s) => s.name).join(',')}`);
  const newUrls = [];

  for (const source of sources) {
    if (newUrls.length >= opts.limit) break;
    let candidates;
    try {
      candidates = (await discover(source)).filter((u) => !articleExists(u)).slice(0, source.maxArticles);
      log(`discovered new=${candidates.length} source=${source.name}`);
    } catch (err) {
      log(`front-page failed source=${source.name} error="${errMsg(err)}"`);
      continue;
    }

    for (const url of candidates) {
      if (newUrls.length >= opts.limit) break;
      const base = { url, source: source.name, regime: source.regime, corpus: source.corpus, language: source.language };
      try {
        await sleep(600, 1400);
        const ex = await extractArticle(url, { renderJs: !!source.renderJs, timeout: source.timeout });
        if (ex.text.length < MIN_BODY_CHARS) {
          insertArticle({ ...base, title: ex.title, body: ex.text, extraction_method: ex.method, status: 'skipped', outcome: 'extraction_failed' });
          log(`skip thin-content url=${url} chars=${ex.text.length}`);
          continue;
        }
        insertArticle({ ...base, title: ex.title, published_at: ex.published_at, body: ex.text, extraction_method: ex.method });
        newUrls.push(url);
        log(`scraped url=${url} title="${(ex.title ?? '').slice(0, 60)}"`);
      } catch (err) {
        insertArticle({ ...base, status: 'failed', last_error: errMsg(err).slice(0, 500) });
        log(`article-failed url=${url} error="${errMsg(err)}"`);
      }
    }
    await sleep(1500, 3000);
  }

  log(`scrape cycle complete new=${newUrls.length}`);
  for (const url of newUrls) console.log(url);
}

main()
  .catch((err) => {
    log(`scrape cycle failed: ${errMsg(err)}`);
    console.error(errMsg(err));
    process.exitCode = 1;
  })
  .finally(closeBrowser);
