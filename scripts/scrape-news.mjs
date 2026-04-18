#!/usr/bin/env node
/**
 * scrape-news.mjs
 * Scrapes article URLs from 31 state/pro-government sources using native fetch
 * + cheerio. Falls back to Puppeteer only when a source returns fewer than 2
 * matching links (indicating a JS-rendered page). Sources with rssUrl use RSS
 * feed parsing instead of HTML scraping.
 *
 * Writes normalized records to agent/data/raw-news.json.
 * Prints new article URLs to stdout (one per line) for cycle.sh.
 *
 * Usage: node scripts/scrape-news.mjs [options]
 *
 * Options:
 *   --source <name>   Only scrape this source (case-insensitive, partial match OK)
 *   --regime <name>   Only scrape sources from this regime (e.g. "Russia", "Iran")
 *   --limit <n>       Max new articles to collect across all sources
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RAW_NEWS_PATH = path.join(ROOT_DIR, 'agent/data/raw-news.json');
const LOG_PATH = path.join(ROOT_DIR, 'agent/data/cycle.log');

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function getFetchHeaders() {
  return {
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

// ── Source configs ────────────────────────────────────────────────────────────

const SOURCES = [
  // ── Russia ──────────────────────────────────────────────────────────────────
  // RT and Sputnik are CF-blocked from direct fetch and RSS; removed.
  {
    name: 'TASS',
    regime: 'Russia',
    language: 'en',
    frontPage: 'https://tass.com/world',
    articlePattern: /^https:\/\/tass\.com\/[a-z-]+\/\d+/,
    maxArticles: 4
  },
  {
    name: 'Kremlin',
    regime: 'Russia',
    language: 'en',
    frontPage: 'http://en.kremlin.ru/events/president/news',
    articlePattern: /^https?:\/\/en\.kremlin\.ru\/(events|news)\/[a-z\/]+\/\d+(?!\/photos|\/video|\/audio)/,
    maxArticles: 3
  },
  {
    name: 'Government.ru',
    regime: 'Russia',
    language: 'en',
    frontPage: 'http://government.ru/en/news/',
    articlePattern: /^https?:\/\/government\.ru\/en\/news\/\d+/,
    maxArticles: 3
  },

  // ── China ────────────────────────────────────────────────────────────────────
  {
    name: 'Xinhua',
    regime: 'China',
    language: 'en',
    frontPage: 'https://english.news.cn/world/index.htm',
    articlePattern: /^https:\/\/english\.news\.cn\/(?:[a-z]+\/)?[0-9]{8}\/[a-f0-9]{32}\/c\.html/,
    maxArticles: 4
  },
  {
    name: 'China Daily',
    regime: 'China',
    language: 'en',
    frontPage: 'https://www.chinadaily.com.cn/world',
    articlePattern: /^https:\/\/(www\.)?chinadaily\.com\.cn\/a\/\d{4}/,
    maxArticles: 4
  },
  {
    name: "People's Daily",
    regime: 'China',
    language: 'en',
    frontPage: 'http://en.people.cn/',
    articlePattern: /^https?:\/\/en\.people\.cn\/n\d+\/\d{4}/,
    maxArticles: 4
  },
  {
    name: 'Global Times',
    regime: 'China',
    language: 'en',
    frontPage: 'https://www.globaltimes.cn/world/',
    articlePattern: /^https:\/\/www\.globaltimes\.cn\/page\/\d{6}\/\d{7}\.shtml/,
    maxArticles: 4
  },

  // ── Middle East ───────────────────────────────────────────────────────────────
  {
    name: 'Al Jazeera',
    regime: 'Qatar',
    language: 'en',
    frontPage: 'https://www.aljazeera.com/news/',
    articlePattern: /^https:\/\/www\.aljazeera\.com\/(news|features|opinion)\/\d{4}\/\d{1,2}\/\d{1,2}\//,
    maxArticles: 4
  },
  {
    name: 'Middle East Eye',
    regime: 'Qatar',
    language: 'en',
    frontPage: 'https://www.middleeasteye.net/news',
    articlePattern: /^https:\/\/www\.middleeasteye\.net\/news\/[a-z0-9-]{10,}/,
    maxArticles: 4
  },
  {
    name: 'Saudi Gazette',
    regime: 'Saudi Arabia',
    language: 'en',
    frontPage: 'https://saudigazette.com.sa/',
    articlePattern: /^https:\/\/saudigazette\.com\.sa\/article\/\d+/,
    maxArticles: 3
  },

  // ── North Korea ──────────────────────────────────────────────────────────────
  // Naenara returns 404; removed. KCNA works from Finnish IP.
  {
    name: 'KCNA',
    regime: 'North Korea',
    language: 'en',
    frontPage: 'https://kcna.kp/en/',
    articlePattern: /^https:\/\/kcna\.kp\/en\/article\//,
    maxArticles: 3,
    timeout: 45000
  },

  // ── Cuba ─────────────────────────────────────────────────────────────────────
  {
    name: 'Granma',
    regime: 'Cuba',
    language: 'en',
    frontPage: 'https://en.granma.cu/',
    articlePattern: /^https:\/\/en\.granma\.cu\/[a-z-]+\/\d{4}-\d{2}-\d{2}\//,
    maxArticles: 3
  },
  {
    name: 'Prensa Latina',
    regime: 'Cuba',
    language: 'en',
    frontPage: 'https://www.prensa-latina.cu/en/',
    articlePattern: /^https:\/\/(www\.)?prensa-latina\.cu\/\d{4}\/\d{2}\/\d{2}\//,
    maxArticles: 3
  },
  {
    name: 'Cubadebate',
    regime: 'Cuba',
    language: 'es',
    frontPage: 'http://www.cubadebate.cu/',
    articlePattern: /^https?:\/\/(www\.)?cubadebate\.cu\/(noticias|opinion)\/\d{4}\/\d{2}\/\d{2}\//,
    maxArticles: 3
  },

  // ── Iran ─────────────────────────────────────────────────────────────────────
  {
    name: 'Press TV',
    regime: 'Iran',
    language: 'en',
    frontPage: 'https://www.presstv.ir/',
    articlePattern: /^https?:\/\/(www\.)?presstv\.ir\/Detail\/\d{4}\/\d{2}\/\d{2}\/\d+/,
    maxArticles: 4
  },
  {
    name: 'Tehran Times',
    regime: 'Iran',
    language: 'en',
    frontPage: 'https://www.tehrantimes.com/',
    articlePattern: /^https:\/\/(www\.)?tehrantimes\.com\/news\/[5-9]\d{5}\//,
    maxArticles: 4
  },

  // ── Belarus ──────────────────────────────────────────────────────────────────
  {
    name: 'BelTA',
    regime: 'Belarus',
    language: 'en',
    frontPage: 'https://eng.belta.by/',
    articlePattern: /^https:\/\/eng\.belta\.by\/[a-z]+\/view\/[a-z0-9-]+-\d+/,
    maxArticles: 4
  },
  {
    name: 'SB Belarus',
    regime: 'Belarus',
    language: 'ru',
    frontPage: 'https://www.sb.by/articles/',
    articlePattern: /^https:\/\/(www\.)?sb\.by\/articles\/[a-z0-9-]+\.html/,
    maxArticles: 3
  },

  // ── Eritrea ───────────────────────────────────────────────────────────────────
  {
    name: 'Shabait',
    regime: 'Eritrea',
    language: 'en',
    rssUrl: 'https://shabait.com/feed/',
    articlePattern: /^https:\/\/shabait\.com\/\d{4}\/\d{2}\/\d{2}\/[a-z][a-z0-9-]+\//,
    maxArticles: 3
  },

  // ── Syria ─────────────────────────────────────────────────────────────────────
  {
    name: 'SANA',
    regime: 'Syria',
    language: 'en',
    rssUrl: 'https://sana.sy/en/feed/',
    articlePattern: /^https:\/\/sana\.sy\/en\/[a-z-]+\/\d{7,}\//,
    maxArticles: 3
  },

  // ── Turkmenistan ──────────────────────────────────────────────────────────────
  {
    name: 'TDH',
    regime: 'Turkmenistan',
    language: 'en',
    frontPage: 'https://tdh.gov.tm/en/',
    articlePattern: /^https:\/\/tdh\.gov\.tm\/en\/post\/\d{4,}\//,
    maxArticles: 3
  },

  // ── Western Sahara ────────────────────────────────────────────────────────────
  {
    name: 'SPS',
    regime: 'Western Sahara',
    language: 'en',
    frontPage: 'https://spsrasd.info/en',
    articlePattern: /^https:\/\/spsrasd\.info\/en\/\d{4}\/\d{2}\/\d{2}\/\d+\.html/,
    maxArticles: 3
  },

  // ── Myanmar ───────────────────────────────────────────────────────────────────
  {
    name: 'GNLM',
    regime: 'Myanmar',
    language: 'en',
    rssUrl: 'https://www.gnlm.com.mm/feed/',
    articlePattern: /^https:\/\/www\.gnlm\.com\.mm\/[a-z][a-z0-9-]{10,}\/$/,
    maxArticles: 3
  },

  // ── Tajikistan ────────────────────────────────────────────────────────────────
  {
    name: 'Khovar',
    regime: 'Tajikistan',
    language: 'en',
    rssUrl: 'http://eng.khovar.tj/feed/',
    articlePattern: /^https?:\/\/eng\.khovar\.tj\/\d{4}\/\d{2}\/[a-z0-9-]+\//,
    maxArticles: 3
  },

  // ── Yemen ─────────────────────────────────────────────────────────────────────
  {
    name: 'SABA',
    regime: 'Yemen',
    language: 'en',
    frontPage: 'https://www.saba.ye/en',
    articlePattern: /^https:\/\/www\.saba\.ye\/en\/news\d+\.htm/,
    maxArticles: 3
  },

  // ── Eswatini (Swaziland) ─────────────────────────────────────────────────────
  // Eswatini Observer: owned by Tibiyo Taka Ngwane (King Mswati III's sovereign fund)
  {
    name: 'Eswatini Observer',
    regime: 'Eswatini',
    language: 'en',
    rssUrl: 'https://eswatiniobserver.com/feed/',
    articlePattern: /^https:\/\/eswatiniobserver\.com\/[a-z][a-z0-9-]{10,}\/$/,
    maxArticles: 3
  },
  // Times of Eswatini: largest daily, operates under royal/government pressure
  {
    name: 'Times of Eswatini',
    regime: 'Eswatini',
    language: 'en',
    frontPage: 'https://www.times.co.sz/',
    articlePattern: /^https:\/\/www\.times\.co\.sz\/[a-z]+\/readmore\.php\?.*yiphi=\d+/,
    maxArticles: 3
  },

  // ── Hungary (Fidesz) ─────────────────────────────────────────────────────────
  {
    name: 'Origo',
    regime: 'Hungary',
    language: 'hu',
    rssUrl: 'https://api.origo.hu/publicapi/hu/rss/origo/itthon/articles',
    articlePattern: /^https:\/\/www\.origo\.hu\/[a-z]+\/\d{4}\/\d{2}\/[a-z0-9-]+/,
    maxArticles: 3
  },
  {
    name: 'Magyar Nemzet',
    regime: 'Hungary',
    language: 'hu',
    frontPage: 'https://magyarnemzet.hu/',
    articlePattern: /^https:\/\/magyarnemzet\.hu\/[a-z]+\/\d{4}\/\d{2}\//,
    maxArticles: 3
  },
  {
    name: 'Hirado',
    regime: 'Hungary',
    language: 'hu',
    frontPage: 'https://hirado.hu/',
    articlePattern: /^https:\/\/hirado\.hu\/[a-z]+\/cikk\/\d{4}\/\d{2}\/\d{2}\//,
    maxArticles: 3
  },
  {
    name: 'PestiSracok',
    regime: 'Hungary',
    language: 'hu',
    frontPage: 'https://pestisracok.hu/',
    articlePattern: /^https:\/\/pestisracok\.hu\/[a-z0-9-]{10,}\//,
    maxArticles: 3
  }
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function log(message) {
  const timestamp = new Date().toISOString();
  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  await appendFile(LOG_PATH, `[${timestamp}] [scrape-news] ${message}\n`, 'utf8');
}

async function loadExisting() {
  if (!existsSync(RAW_NEWS_PATH)) return [];
  try {
    return JSON.parse(await readFile(RAW_NEWS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

async function fetchHtml(url, timeout = 20000) {
  const response = await fetch(url, {
    headers: getFetchHeaders(),
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.text();
}

// ── URL discovery ─────────────────────────────────────────────────────────────

async function discoverUrlsFromRss(source) {
  const xml = await fetchHtml(source.rssUrl, source.timeout);
  const urls = [];
  const linkPattern = /<link>\s*(?:<!\[CDATA\[)?\s*(https?[^<\]]+?)\s*(?:\]\]>)?\s*<\/link>/g;
  let match;
  while ((match = linkPattern.exec(xml)) !== null) {
    const url = match[1].trim();
    if (source.articlePattern.test(url)) urls.push(url);
  }
  return [...new Set(urls)].slice(0, source.maxArticles);
}

async function discoverUrlsWithFetch(source) {
  const html = await fetchHtml(source.frontPage, source.timeout);
  const $ = cheerio.load(html);
  const hrefs = new Set();

  $('a[href]').each((_, el) => {
    let href = $(el).attr('href') || '';
    // Resolve relative URLs
    if (href.startsWith('/')) {
      href = new URL(href, source.frontPage).href;
    }
    if (source.articlePattern.test(href)) hrefs.add(href);
  });

  return [...hrefs].slice(0, source.maxArticles);
}

async function discoverUrlsWithPuppeteer(source) {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    return [];
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      // --single-process is Linux/Pi only; skip on macOS to avoid Chromium crashes
      ...(process.platform === 'linux' ? ['--single-process'] : [])
    ]
  });

  try {
    const page = await browser.newPage();
    await page.goto(source.frontPage, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await randomDelay(1500, 2500);

    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.href)
        .filter(Boolean)
    );

    return [...new Set(hrefs)]
      .filter((href) => source.articlePattern.test(href))
      .slice(0, source.maxArticles);
  } finally {
    await browser.close();
  }
}

async function discoverArticleUrls(source) {
  if (source.rssUrl) return discoverUrlsFromRss(source);

  const urls = await discoverUrlsWithFetch(source);
  if (urls.length >= 2) return urls;

  // Fewer than 2 links suggests the page is JS-rendered — try Puppeteer.
  await log(`fetch returned ${urls.length} links source=${source.name}; trying puppeteer fallback`);
  return discoverUrlsWithPuppeteer(source);
}

// ── Article metadata extraction ───────────────────────────────────────────────

async function extractArticleMetadata(url, source, timeout) {
  const html = await fetchHtml(url, timeout);
  const $ = cheerio.load(html);

  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    '';

  const publishedAt =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="date"]').attr('content') ||
    $('time[datetime]').first().attr('datetime') ||
    '';

  const paragraphs = [];
  const articleScope = $('article, main').first();
  const scope = articleScope.length ? articleScope : $('body');

  scope.find('p').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length >= 40) paragraphs.push(text);
  });

  // Fallback for sites that use divs instead of <p> for article body
  if (paragraphs.length === 0) {
    $('[class*="mainText"], [class*="article-body"], [class*="entry-content"], [class*="post-content"]').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length >= 80) paragraphs.push(text);
    });
  }

  return {
    source: source.name,
    language: source.language,
    title,
    published_at: publishedAt,
    body: paragraphs.join(' ')
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: null, regime: null, limit: Infinity };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i].toLowerCase(); break;
      case '--regime': opts.regime = args[++i].toLowerCase(); break;
      case '--limit':  opts.limit  = parseInt(args[++i], 10); break;
    }
  }
  return opts;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  let activeSources = SOURCES;
  if (opts.source) activeSources = activeSources.filter((s) => s.name.toLowerCase().includes(opts.source));
  if (opts.regime) activeSources = activeSources.filter((s) => s.regime.toLowerCase().includes(opts.regime));

  if (activeSources.length === 0) {
    console.error(`No sources matched. Available: ${SOURCES.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }

  await log(`scrape cycle started sources=${activeSources.map((s) => s.name).join(',')}`);

  const existing = await loadExisting();
  const seenUrls = new Set(existing.map((r) => r.url));
  const newRecords = [];

  for (const source of activeSources) {
    if (newRecords.length >= opts.limit) break;
    let articleUrls;
    try {
      articleUrls = await discoverArticleUrls(source);
      await log(`discovered count=${articleUrls.length} source=${source.name}`);
    } catch (err) {
      await log(`front-page failed source=${source.name} error="${err instanceof Error ? err.message : err}"`);
      continue;
    }

    for (const url of articleUrls) {
      if (newRecords.length >= opts.limit) break;
      if (seenUrls.has(url)) {
        await log(`skip existing url=${url}`);
        continue;
      }

      try {
        await randomDelay(600, 1400);
        const article = await extractArticleMetadata(url, source, source.timeout);

        if (!article.body || article.body.length < 100) {
          await log(`skip thin-content url=${url}`);
          continue;
        }

        newRecords.push({
          ...article,
          url,
          regime: source.regime,
          retrieved_at: new Date().toISOString()
        });
        seenUrls.add(url);
        await log(`scraped url=${url} title="${article.title.slice(0, 60)}"`);
      } catch (err) {
        await log(`article-failed url=${url} error="${err instanceof Error ? err.message : err}"`);
      }
    }

    await randomDelay(1500, 3000); // pause between sources
  }

  if (newRecords.length === 0) {
    await log('scrape cycle complete new=0');
    return;
  }

  const updated = [...newRecords, ...existing];
  await mkdir(path.dirname(RAW_NEWS_PATH), { recursive: true });
  await writeFile(RAW_NEWS_PATH, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  await log(`scrape cycle complete new=${newRecords.length} total=${updated.length}${opts.limit < Infinity ? ` (limit=${opts.limit})` : ''}`);

  // Print new URLs to stdout so cycle.sh can pick them up.
  for (const record of newRecords) {
    console.log(record.url);
  }
}

main().catch(async (err) => {
  await log(`scrape cycle failed: ${err instanceof Error ? err.message : err}`);
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
