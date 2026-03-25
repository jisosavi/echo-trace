#!/usr/bin/env node
/**
 * scrape-news.mjs
 * Scrapes article URLs from 24 state/pro-government sources across Russia, China,
 * Saudi Arabia, North Korea, Cuba, and Hungary using Puppeteer with stealth settings.
 * Writes normalized records to agent/data/raw-news.json.
 *
 * NOT activated automatically — run manually or via openclaw-cycle.sh.
 * Usage: node scripts/scrape-news.mjs
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RAW_NEWS_PATH = path.join(ROOT_DIR, 'agent/data/raw-news.json');
const LOG_PATH = path.join(ROOT_DIR, 'agent/data/openclaw.log');

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
    const raw = await readFile(RAW_NEWS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── Article discovery ─────────────────────────────────────────────────────────

async function discoverArticleUrls(page, source) {
  await log(`visiting front page source=${source.name} url=${source.frontPage}`);
  await page.goto(source.frontPage, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await randomDelay(1500, 3000);

  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.href)
      .filter(Boolean)
  );

  const matched = [...new Set(hrefs)]
    .filter((href) => source.articlePattern.test(href))
    .slice(0, source.maxArticles);

  await log(`discovered count=${matched.length} urls source=${source.name}`);
  return matched;
}

// ── Article extraction ────────────────────────────────────────────────────────

async function extractArticle(page, url, source) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await randomDelay(1200, 2500);

  return page.evaluate((sourceInfo) => {
    const readMeta = (selector) =>
      document.querySelector(selector)?.getAttribute('content')?.trim() ?? '';

    const title =
      document.querySelector('h1')?.textContent?.trim() ||
      readMeta('meta[property="og:title"]') ||
      readMeta('meta[name="title"]') ||
      '';

    const publishedAt =
      readMeta('meta[property="article:published_time"]') ||
      readMeta('meta[name="date"]') ||
      document.querySelector('time[datetime]')?.getAttribute('datetime') ||
      '';

    const article =
      document.querySelector('article') ||
      document.querySelector('main') ||
      document.body;

    const body = Array.from(article.querySelectorAll('p'))
      .map((p) => (p.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length >= 40)
      .join(' ');

    return {
      source: sourceInfo.name,
      language: sourceInfo.language,
      title,
      published_at: publishedAt,
      body
    };
  }, source);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await log('scrape cycle started');

  const existing = await loadExisting();
  const seenUrls = new Set(existing.map((r) => r.url));
  const newRecords = [];

  const browser = await puppeteerExtra.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    for (const source of SOURCES) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

      let articleUrls;
      try {
        articleUrls = await discoverArticleUrls(page, source);
      } catch (err) {
        await log(`front-page failed source=${source.name} error="${err instanceof Error ? err.message : err}"`);
        await page.close();
        continue;
      }

      for (const url of articleUrls) {
        if (seenUrls.has(url)) {
          await log(`skip existing url=${url}`);
          continue;
        }

        try {
          await randomDelay(800, 1800);
          const article = await extractArticle(page, url, source);

          if (!article.body || article.body.length < 100) {
            await log(`skip thin-content url=${url}`);
            continue;
          }

          const record = {
            ...article,
            url,
            regime: source.regime,
            retrieved_at: new Date().toISOString()
          };

          newRecords.push(record);
          seenUrls.add(url);
          await log(`scraped url=${url} title="${article.title.slice(0, 60)}"`);
        } catch (err) {
          await log(`article-failed url=${url} error="${err instanceof Error ? err.message : err}"`);
        }
      }

      await page.close();
      await randomDelay(2000, 4000); // pause between sources
    }
  } finally {
    await browser.close();
  }

  if (newRecords.length === 0) {
    await log('scrape cycle complete new=0');
    return;
  }

  const updated = [...newRecords, ...existing];
  await mkdir(path.dirname(RAW_NEWS_PATH), { recursive: true });
  await writeFile(RAW_NEWS_PATH, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  await log(`scrape cycle complete new=${newRecords.length} total=${updated.length}`);

  // Print new URLs to stdout so openclaw-cycle.sh can pick them up.
  for (const record of newRecords) {
    console.log(record.url);
  }
}

main().catch(async (err) => {
  await log(`scrape cycle failed: ${err instanceof Error ? err.message : err}`);
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
