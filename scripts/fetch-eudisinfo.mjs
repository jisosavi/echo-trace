#!/usr/bin/env node
/**
 * fetch-eudisinfo.mjs
 * Fetches disinformation cases from EUvsDisinfo (euvsdisinfo.eu) with
 * keyword filtering, full pagination via quarterly date chunks, and JSON output.
 *
 * The listing pages work via direct fetch. Detail pages (--full) are CF-blocked
 * and require Puppeteer.
 *
 * Usage:
 *   node scripts/fetch-eudisinfo.mjs --keyword "ukraine" [options]
 *
 * Options:
 *   --keyword <str>       Search keyword(s) (required)
 *   --output <path>       Output JSON path (default: agent/data/eudisinfo-<keyword>.json)
 *   --start-year <n>      First year to fetch (default: 2015)
 *   --end-year <n>        Last year to fetch (default: current year)
 *   --per-page <n>        Results per chunk request (default: 1000, max ~1000 before CF blocks)
 *   --full                Also fetch each case's detail page (needs Puppeteer / cookies)
 *   --cookies <path>      Netscape cookie file for CF bypass on detail pages
 *   --delay <ms>          Min delay between requests in ms (default: 1200)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const now = new Date().getFullYear();
  const opts = {
    keyword: '', startYear: 2015, endYear: now,
    perPage: 1000, full: false, delay: 1200, output: null, cookies: null
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--keyword':    opts.keyword    = args[++i]; break;
      case '--output':     opts.output     = args[++i]; break;
      case '--start-year': opts.startYear  = parseInt(args[++i], 10); break;
      case '--end-year':   opts.endYear    = parseInt(args[++i], 10); break;
      case '--per-page':   opts.perPage    = parseInt(args[++i], 10); break;
      case '--delay':      opts.delay      = parseInt(args[++i], 10); break;
      case '--full':       opts.full       = true; break;
      case '--cookies':    opts.cookies    = args[++i]; break;
    }
  }
  if (!opts.keyword) {
    console.error('Error: --keyword is required');
    process.exit(1);
  }
  if (!opts.output) {
    const slug = opts.keyword.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    opts.output = path.join(ROOT, `agent/data/eudisinfo-${slug}.json`);
  }
  return opts;
}

// ── Timing ────────────────────────────────────────────────────────────────────

function randomDelay(minMs, maxMs = minMs * 1.5) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((r) => setTimeout(r, ms));
}

// ── Date range helpers ────────────────────────────────────────────────────────

function fmtDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function quarterRanges(year) {
  return [
    [new Date(year, 0, 1),  new Date(year, 2, 31)],
    [new Date(year, 3, 1),  new Date(year, 5, 30)],
    [new Date(year, 6, 1),  new Date(year, 8, 30)],
    [new Date(year, 9, 1),  new Date(year, 11, 31)],
  ].map(([s, e]) => `${fmtDate(s)} - ${fmtDate(e)}`);
}

function monthRanges(year, quarterIndex) {
  const startMonth = quarterIndex * 3;
  return Array.from({ length: 3 }, (_, i) => {
    const m = startMonth + i;
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0);
    return `${fmtDate(start)} - ${fmtDate(end)}`;
  });
}

// ── URL builder ───────────────────────────────────────────────────────────────

function buildListUrl(keyword, perPage, dateStr) {
  const params = new URLSearchParams({ text: keyword, per_page: String(perPage) });
  if (dateStr) params.set('date', dateStr);
  return `https://euvsdisinfo.eu/disinformation-cases/?${params}`;
}

// ── Direct fetch (listing pages pass CF without browser) ──────────────────────

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
};

async function fetchDirect(url) {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length < 20000 && (text.includes('Just a moment') || text.includes('cf-browser-verification'))) {
    throw new Error('Cloudflare challenge');
  }
  return text;
}

// ── Puppeteer (for --full detail pages which are CF-blocked) ──────────────────

let _browser = null;
let _loadedCookies = null;

async function getBrowser() {
  if (_browser) return _browser;
  const puppeteer = (await import('puppeteer')).default;
  _browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--disable-blink-features=AutomationControlled', '--window-size=1366,768']
  });
  return _browser;
}

async function loadCookiesFromFile(cookiePath) {
  const text = await readFile(cookiePath, 'utf8');
  return text.split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((line) => {
      const [domain, , path, secure, expires, name, value] = line.split('\t');
      if (!name) return null;
      return { name, value, domain, path, secure: secure === 'TRUE', expires: parseInt(expires, 10) || undefined };
    })
    .filter(Boolean);
}

async function waitForCf(page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const title = await page.title();
    const content = await page.content();
    if (!title.includes('Just a moment') && !content.includes('cf-browser-verification')) return true;
    await randomDelay(1500, 2000);
  }
  return false;
}

async function fetchWithPuppeteer(url, cookieFile = null) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(BROWSER_HEADERS['User-Agent']);
    await page.setViewport({ width: 1366, height: 768 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });
    if (cookieFile) {
      if (!_loadedCookies) {
        _loadedCookies = await loadCookiesFromFile(cookieFile);
        console.log(`  Loaded ${_loadedCookies.length} cookies from ${cookieFile}`);
      }
      await page.setCookie(..._loadedCookies);
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const passed = await waitForCf(page, 18000);
    if (!passed) throw new Error('Cloudflare challenge did not pass. Use --cookies <file>.');
    await randomDelay(2000, 3000);
    return await page.content();
  } finally {
    await page.close();
  }
}

// ── HTML parsing ──────────────────────────────────────────────────────────────

function parseCaseList($) {
  const cases = [];
  $('a.b-archive__database-item').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    const url = href.startsWith('http') ? href : `https://euvsdisinfo.eu${href}`;
    const prefix = $el.find('.b-archive__database-item-prefix').text().trim();
    const fullTitle = $el.find('.b-archive__database-item-title').text().trim();
    const title = fullTitle.startsWith(prefix) ? fullTitle.slice(prefix.length).trim() : fullTitle;
    const date = $el.find('.b-archive__database-item-date').text().trim();
    if (title || url) cases.push({ title, date, url });
  });
  return cases;
}

function parseLoadmoreParams(html) {
  const m = html.match(/reports_loadmore_params\s*=\s*({[^}]+})/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// ── Case detail fetching (--full mode, needs Puppeteer) ───────────────────────

async function fetchCaseDetail(url, cookieFile = null) {
  const html = await fetchWithPuppeteer(url, cookieFile);
  const $ = cheerio.load(html);

  const debunkText = $('.b-report__summary, .b-report__description, article .entry-content, .report-content')
    .first().text().replace(/\s+/g, ' ').trim();
  const keywords = [];
  $('[class*="keyword"], [class*="tag"], [rel="tag"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length < 80) keywords.push(t);
  });
  const narratives = [];
  $('[class*="narrative"], [class*="motif"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length < 200) narratives.push(t);
  });
  return { debunk_text: debunkText, keywords: [...new Set(keywords)], narratives: [...new Set(narratives)] };
}

// ── Fetch one date-range chunk, auto-split to months if >perPage items ────────

async function fetchChunk(keyword, perPage, dateStr, delay) {
  const url = buildListUrl(keyword, perPage, dateStr);
  console.log(`  [chunk] ${dateStr || 'all'} — ${url}`);

  const html = await fetchDirect(url);
  const $ = cheerio.load(html);
  const cases = parseCaseList($);
  const params = parseLoadmoreParams(html);
  const maxPage = params ? parseInt(params.max_page, 10) : 1;
  const curPerPage = params ? parseInt(params.current_per_page, 10) : perPage;
  const totalEstimate = maxPage * curPerPage;

  console.log(`    → ${cases.length} cases (est. total in range: ${totalEstimate})`);
  return { cases, totalEstimate };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  console.log(`\nEUDisInfo scraper`);
  console.log(`  keyword    : ${opts.keyword}`);
  console.log(`  years      : ${opts.startYear}–${opts.endYear}`);
  console.log(`  per-page   : ${opts.perPage}`);
  console.log(`  full mode  : ${opts.full}`);
  console.log(`  output     : ${opts.output}\n`);

  const allCases = [];
  const seenUrls = new Set();

  function addCases(cases, searchKeyword) {
    let added = 0;
    for (const c of cases) {
      if (seenUrls.has(c.url)) continue;
      seenUrls.add(c.url);
      allCases.push({ ...c, search_keyword: searchKeyword, scraped_at: new Date().toISOString() });
      added++;
    }
    return added;
  }

  for (let year = opts.startYear; year <= opts.endYear; year++) {
    console.log(`\n[year ${year}]`);
    const quarters = quarterRanges(year);

    for (let qi = 0; qi < quarters.length; qi++) {
      const qDate = quarters[qi];

      // Skip future quarters
      const qStart = new Date(year, qi * 3, 1);
      if (qStart > new Date()) continue;

      await randomDelay(opts.delay, opts.delay * 1.5);

      let { cases, totalEstimate } = await fetchChunk(opts.keyword, opts.perPage, qDate, opts.delay);

      if (cases.length >= opts.perPage) {
        // Hit the hard limit — split into months to get the rest
        console.log(`    Quarter hit per_page limit, splitting into months...`);
        cases = [];
        for (const mDate of monthRanges(year, qi)) {
          await randomDelay(opts.delay, opts.delay * 1.5);
          const r = await fetchChunk(opts.keyword, opts.perPage, mDate, opts.delay);
          cases.push(...r.cases);
          if (r.cases.length >= opts.perPage) {
            console.warn(`    Warning: month ${mDate} hit limit — some cases may be missing`);
          }
        }
      }

      const added = addCases(cases, opts.keyword);
      console.log(`    Added ${added} new cases (total so far: ${allCases.length})`);
    }
  }

  console.log(`\nTotal unique cases: ${allCases.length}`);

  // --full: fetch detail pages
  if (opts.full) {
    console.log('\nFetching detail pages (Puppeteer)...');
    for (const c of allCases) {
      if (!c.url) continue;
      try {
        await randomDelay(opts.delay * 1.5, opts.delay * 2.5);
        const detail = await fetchCaseDetail(c.url, opts.cookies);
        Object.assign(c, detail);
        process.stdout.write('.');
      } catch (err) {
        console.log(`\n  Detail failed for ${c.url}: ${err.message}`);
      }
    }
    console.log('');
  }

  await mkdir(path.dirname(opts.output), { recursive: true });
  await writeFile(opts.output, JSON.stringify(allCases, null, 2) + '\n', 'utf8');
  console.log(`Saved ${allCases.length} cases to ${opts.output}`);

  if (_browser) await _browser.close();
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  if (_browser) _browser.close().catch(() => {});
  process.exit(1);
});
