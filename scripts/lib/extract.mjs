/**
 * extract.mjs — fetch a page and extract its article text.
 *
 * Chain: Readability → JSON-LD articleBody → <p> paragraphs → Puppeteer.
 * One Puppeteer browser is shared per process; call closeBrowser() at exit.
 */
import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as cheerio from 'cheerio';

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

export const MIN_BODY_CHARS = 260;

export function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function normalizeWhitespace(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export async function fetchHtml(url, timeout = 20000) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
    headers: {
      'User-Agent': randomUserAgent(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.text();
}

// ── Puppeteer (lazy, shared) ─────────────────────────────────────────────────

let browserPromise = null;

export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = (await import('puppeteer')).default;
      return puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          // --single-process is for low-memory Linux (Pi); it crashes Chromium on macOS.
          ...(process.platform === 'linux' ? ['--single-process'] : []),
        ],
      });
    })();
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  try { (await browserPromise).close(); } catch { /* already gone */ }
  browserPromise = null;
}

/** Render a page in Chromium and return its final HTML. */
export async function renderHtml(url, { timeout = 45000, settleMs = 2000 } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(randomUserAgent());
    await page.goto(url, { waitUntil: 'networkidle2', timeout });
    await new Promise((r) => setTimeout(r, settleMs));
    return await page.content();
  } finally {
    await page.close();
  }
}

// ── Extraction from HTML ─────────────────────────────────────────────────────

function readabilityText(html, url) {
  try {
    const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
    const article = new Readability(dom.window.document).parse();
    return { text: normalizeWhitespace(article?.textContent ?? ''), title: article?.title ?? '' };
  } catch {
    return { text: '', title: '' };
  }
}

function jsonLdBodies($) {
  const bodies = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const types = [].concat(node['@type'] ?? []).map((t) => String(t).toLowerCase());
    if (types.some((t) => t.includes('article')) && typeof node.articleBody === 'string') {
      bodies.push(normalizeWhitespace(node.articleBody));
    }
    Object.values(node).forEach((v) => { if (v && typeof v === 'object') visit(v); });
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try { visit(JSON.parse($(el).contents().text())); } catch { /* templated JSON */ }
  });
  return bodies;
}

function paragraphText($) {
  const scope = $('article, main').first().length ? $('article, main').first() : $('body');
  const paras = [];
  scope.find('p').each((_, el) => {
    const t = normalizeWhitespace($(el).text());
    if (t.length >= 40) paras.push(t);
  });
  if (paras.length === 0) {
    $('[class*="mainText"], [class*="article-body"], [class*="entry-content"], [class*="post-content"]').each((_, el) => {
      const t = normalizeWhitespace($(el).text());
      if (t.length >= 80) paras.push(t);
    });
  }
  return paras.join(' ');
}

/** Pure HTML → { title, published_at, text, method }. */
export function extractFromHtml(html, url) {
  const $ = cheerio.load(html);
  const title =
    normalizeWhitespace($('meta[property="og:title"]').attr('content')) ||
    normalizeWhitespace($('h1').first().text()) ||
    '';
  const published_at =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="date"]').attr('content') ||
    $('time[datetime]').first().attr('datetime') ||
    '';

  const r = readabilityText(html, url);
  if (r.text.length >= MIN_BODY_CHARS) return { title: title || r.title, published_at, text: r.text, method: 'readability' };

  const ld = normalizeWhitespace(jsonLdBodies($).join(' '));
  if (ld.length >= MIN_BODY_CHARS) return { title, published_at, text: ld, method: 'jsonld' };

  const p = paragraphText($);
  if (p.length >= MIN_BODY_CHARS) return { title, published_at, text: p, method: 'dom_paragraphs' };

  return { title, published_at, text: r.text || ld || p, method: 'weak' };
}

/**
 * Fetch and extract one article. Falls back to Puppeteer when plain fetch
 * yields too little text (or immediately when renderJs is set).
 */
export async function extractArticle(url, { renderJs = false, timeout = 20000 } = {}) {
  let result = null;
  let fetchError = null;

  if (!renderJs) {
    try {
      result = extractFromHtml(await fetchHtml(url, timeout), url);
      if (result.text.length >= MIN_BODY_CHARS) return result;
    } catch (err) {
      fetchError = err;
    }
  }

  try {
    const rendered = extractFromHtml(await renderHtml(url), url);
    if (rendered.text.length >= MIN_BODY_CHARS) return { ...rendered, method: `puppeteer_${rendered.method}` };
    if (!result || rendered.text.length > result.text.length) result = { ...rendered, method: 'puppeteer_weak' };
  } catch (err) {
    if (!result) throw fetchError ?? err;
  }
  return result;
}
