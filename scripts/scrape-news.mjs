#!/usr/bin/env node
/**
 * scrape-news.mjs
 * Scrapes article URLs from 24 state/pro-government sources using native fetch
 * + cheerio. Falls back to Puppeteer only when a source returns fewer than 2
 * matching links (indicating a JS-rendered page).
 *
 * Writes normalized records to agent/data/raw-news.json.
 * Prints new article URLs to stdout (one per line) for cycle.sh.
 *
 * Usage: node scripts/scrape-news.mjs
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
const LOG_PATH = path.join(ROOT_DIR, 'agent/data/openclaw.log');

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

// ── Source configs ────────────────────────────────────────────────────────────

const SOURCES = [
  // ── Russia ──────────────────────────────────────────────────────────────────
  {
    name: 'RT',
    regime: 'Russia',
    language: 'en',
    frontPage: 'https://www.rt.com/news/',
    articlePattern: /^https:\/\/(www\.)?rt\.com\/(news|russia|world|politics|business|op-ed)\/\d+/,
    maxArticles: 4
  },
  {
    name: 'Sputnik',
    regime: 'Russia',
    language: 'en',
    frontPage: 'https://sputniknews.com/',
    articlePattern: /^https:\/\/sputniknews\.com\/\d{8}\/[a-z0-9-]+-\d+\.html/,
    maxArticles: 4
  },
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
    articlePattern: /^https?:\/\/en\.kremlin\.ru\/(events|news)\/[a-z\/]+\/\d+/,
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
    frontPage: 'https://english.news.cn/',
    articlePattern: /^https:\/\/english\.news\.cn\/\d{8}\/[a-z0-9_]+\.htm/,
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
    name: 'CGTN',
    regime: 'China',
    language: 'en',
    frontPage: 'https://news.cgtn.com/',
    articlePattern: /^https:\/\/news\.cgtn\.com\/news\/\d{4}-\d{2}-\d{2}\//,
    maxArticles: 4
  },
  {
    name: 'China.org.cn',
    regime: 'China',
    language: 'en',
    frontPage: 'http://www.china.org.cn/world/',
    articlePattern: /^https?:\/\/(www\.)?china\.org\.cn\/[a-z\/_-]+\d{4}-\d{2}\/[a-z0-9_]+\.htm/,
    maxArticles: 3
  },

  // ── Saudi Arabia ─────────────────────────────────────────────────────────────
  {
    name: 'SPA',
    regime: 'Saudi Arabia',
    language: 'en',
    frontPage: 'https://www.spa.gov.sa/en',
    articlePattern: /^https:\/\/www\.spa\.gov\.sa\/en\/[a-z0-9-]+-\d+/,
    maxArticles: 4
  },
  {
    name: 'Al Arabiya',
    regime: 'Saudi Arabia',
    language: 'en',
    frontPage: 'https://english.alarabiya.net/',
    articlePattern: /^https:\/\/english\.alarabiya\.net\/[A-Za-z]+\/[a-z-]+\/\d{4}\/\d{2}\/\d{2}\//,
    maxArticles: 4
  },
  {
    name: 'Arab News',
    regime: 'Saudi Arabia',
    language: 'en',
    frontPage: 'https://www.arabnews.com/',
    articlePattern: /^https:\/\/(www\.)?arabnews\.com\/node\/\d{6,}/,
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
  // Note: NK sites are often inaccessible outside the country; failures are expected.
  {
    name: 'KCNA',
    regime: 'North Korea',
    language: 'en',
    frontPage: 'https://kcna.kp/en/',
    articlePattern: /^https:\/\/kcna\.kp\/en\/article\//,
    maxArticles: 3
  },
  {
    name: 'Naenara',
    regime: 'North Korea',
    language: 'en',
    frontPage: 'http://www.naenara.com.kp/en/news/',
    articlePattern: /^https?:\/\/www\.naenara\.com\.kp\/en\/(news|politics|economy)\//,
    maxArticles: 3
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

  // ── Hungary (Fidesz) ─────────────────────────────────────────────────────────
  {
    name: 'Origo',
    regime: 'Hungary',
    language: 'hu',
    frontPage: 'https://www.origo.hu/',
    articlePattern: /^https:\/\/(www\.)?origo\.hu\/[a-z]+\/\d{4}-\d{2}-\d{2}/,
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

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: FETCH_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.text();
}

// ── URL discovery ─────────────────────────────────────────────────────────────

async function discoverUrlsWithFetch(source) {
  const html = await fetchHtml(source.frontPage);
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
  const urls = await discoverUrlsWithFetch(source);
  if (urls.length >= 2) return urls;

  // Fewer than 2 links suggests the page is JS-rendered — try Puppeteer.
  await log(`fetch returned ${urls.length} links source=${source.name}; trying puppeteer fallback`);
  return discoverUrlsWithPuppeteer(source);
}

// ── Article metadata extraction ───────────────────────────────────────────────

async function extractArticleMetadata(url, source) {
  const html = await fetchHtml(url);
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

  return {
    source: source.name,
    language: source.language,
    title,
    published_at: publishedAt,
    body: paragraphs.join(' ')
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await log('scrape cycle started');

  const existing = await loadExisting();
  const seenUrls = new Set(existing.map((r) => r.url));
  const newRecords = [];

  for (const source of SOURCES) {
    let articleUrls;
    try {
      articleUrls = await discoverArticleUrls(source);
      await log(`discovered count=${articleUrls.length} source=${source.name}`);
    } catch (err) {
      await log(`front-page failed source=${source.name} error="${err instanceof Error ? err.message : err}"`);
      continue;
    }

    for (const url of articleUrls) {
      if (seenUrls.has(url)) {
        await log(`skip existing url=${url}`);
        continue;
      }

      try {
        await randomDelay(600, 1400);
        const article = await extractArticleMetadata(url, source);

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
  await log(`scrape cycle complete new=${newRecords.length} total=${updated.length}`);

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
