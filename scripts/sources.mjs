/**
 * sources.mjs — every outlet the scraper monitors.
 *
 * corpus: 'state'   — state-owned or state-controlled outlets in countries rated
 *                     "Not Free" by Freedom House. These are the subject of the work.
 *         'control' — public-service broadcasters in democracies. They run through the
 *                     identical pipeline and provide the baseline echo rate.
 *
 * Discovery: rssUrl → RSS/RDF <link> parsing; otherwise frontPage → HTML link
 * harvesting (Puppeteer fallback when fewer than 2 links match).
 * renderJs: true → article pages need a real browser (JS-only sites).
 * stripQuery: true → drop ?tracking=params from discovered URLs.
 */

export const SOURCES = [
  // ── Russia ──────────────────────────────────────────────────────────────────
  {
    name: 'TASS', regime: 'Russia', corpus: 'state', language: 'en',
    frontPage: 'https://tass.com/world',
    articlePattern: /^https:\/\/tass\.com\/[a-z-]+\/\d+/,
    maxArticles: 4,
  },
  {
    name: 'Kremlin', regime: 'Russia', corpus: 'state', language: 'en',
    frontPage: 'http://en.kremlin.ru/events/president/news',
    articlePattern: /^https?:\/\/en\.kremlin\.ru\/(events|news)\/[a-z\/]+\/\d+(?!\/photos|\/video|\/audio)/,
    maxArticles: 3,
  },
  {
    name: 'Government.ru', regime: 'Russia', corpus: 'state', language: 'en',
    frontPage: 'http://government.ru/en/news/',
    articlePattern: /^https?:\/\/government\.ru\/en\/news\/\d+/,
    maxArticles: 3,
  },

  // ── China ───────────────────────────────────────────────────────────────────
  {
    name: 'Xinhua', regime: 'China', corpus: 'state', language: 'en',
    frontPage: 'https://english.news.cn/world/index.htm',
    articlePattern: /^https:\/\/english\.news\.cn\/(?:[a-z]+\/)?[0-9]{8}\/[a-f0-9]{32}\/c\.html/,
    maxArticles: 4,
  },
  {
    name: 'China Daily', regime: 'China', corpus: 'state', language: 'en',
    frontPage: 'https://www.chinadaily.com.cn/world',
    articlePattern: /^https:\/\/(www\.)?chinadaily\.com\.cn\/a\/\d{4}/,
    maxArticles: 4,
  },
  {
    name: "People's Daily", regime: 'China', corpus: 'state', language: 'en',
    frontPage: 'http://en.people.cn/',
    articlePattern: /^https?:\/\/en\.people\.cn\/n\d+\/\d{4}/,
    maxArticles: 4,
  },
  {
    name: 'Global Times', regime: 'China', corpus: 'state', language: 'en',
    frontPage: 'https://www.globaltimes.cn/world/',
    articlePattern: /^https:\/\/www\.globaltimes\.cn\/page\/\d{6}\/\d{7}\.shtml/,
    maxArticles: 4,
  },

  // ── North Korea ─────────────────────────────────────────────────────────────
  {
    name: 'KCNA', regime: 'North Korea', corpus: 'state', language: 'en',
    frontPage: 'https://kcna.kp/en/',
    articlePattern: /^https?:\/\/(www\.)?kcna\.kp\/en\/article\//,
    httpsFallbackToHttp: true,
    maxArticles: 3,
    timeout: 45000,
  },

  // ── Cuba ────────────────────────────────────────────────────────────────────
  {
    name: 'Granma', regime: 'Cuba', corpus: 'state', language: 'en',
    frontPage: 'https://en.granma.cu/',
    articlePattern: /^https:\/\/en\.granma\.cu\/[a-z-]+\/\d{4}-\d{2}-\d{2}\//,
    maxArticles: 3,
  },
  {
    name: 'Prensa Latina', regime: 'Cuba', corpus: 'state', language: 'en',
    frontPage: 'https://www.prensa-latina.cu/en/',
    articlePattern: /^https:\/\/(www\.)?prensa-latina\.cu\/\d{4}\/\d{2}\/\d{2}\//,
    maxArticles: 3,
  },
  {
    name: 'Cubadebate', regime: 'Cuba', corpus: 'state', language: 'es',
    frontPage: 'http://www.cubadebate.cu/',
    articlePattern: /^https?:\/\/(www\.)?cubadebate\.cu\/(noticias|opinion)\/\d{4}\/\d{2}\/\d{2}\//,
    maxArticles: 3,
  },

  // ── Iran ────────────────────────────────────────────────────────────────────
  {
    name: 'Press TV', regime: 'Iran', corpus: 'state', language: 'en',
    // Moved from presstv.ir (which now redirects here); article links are JS-rendered, so use the feed.
    rssUrl: 'https://www.presstv.co.uk/rss.xml',
    articlePattern: /^https?:\/\/(www\.)?presstv\.(ir|co\.uk)\/Detail\/\d{4}\/\d{2}\/\d{2}\/\d+/,
    maxArticles: 4,
  },
  {
    name: 'Tehran Times', regime: 'Iran', corpus: 'state', language: 'en',
    frontPage: 'https://www.tehrantimes.com/',
    articlePattern: /^https:\/\/(www\.)?tehrantimes\.com\/news\/[5-9]\d{5}\//,
    maxArticles: 4,
  },

  // ── Saudi Arabia ────────────────────────────────────────────────────────────
  // Saudi Press Agency — official state news agency. JS-only site.
  {
    name: 'SPA', regime: 'Saudi Arabia', corpus: 'state', language: 'en',
    frontPage: 'https://www.spa.gov.sa/en',
    articlePattern: /^https:\/\/www\.spa\.gov\.sa\/en\/N\d+$/,
    renderJs: true,
    maxArticles: 3,
  },

  // ── Belarus ─────────────────────────────────────────────────────────────────
  {
    name: 'BelTA', regime: 'Belarus', corpus: 'state', language: 'en',
    frontPage: 'https://eng.belta.by/',
    articlePattern: /^https:\/\/eng\.belta\.by\/[a-z]+\/view\/[a-z0-9-]+-\d+/,
    maxArticles: 4,
  },
  {
    name: 'SB Belarus', regime: 'Belarus', corpus: 'state', language: 'ru',
    frontPage: 'https://www.sb.by/articles/',
    articlePattern: /^https:\/\/(www\.)?sb\.by\/articles\/[a-z0-9-]+\.html/,
    maxArticles: 3,
  },

  // ── Eritrea ─────────────────────────────────────────────────────────────────
  {
    name: 'Shabait', regime: 'Eritrea', corpus: 'state', language: 'en',
    rssUrl: 'https://shabait.com/feed/',
    articlePattern: /^https:\/\/shabait\.com\/\d{4}\/\d{2}\/\d{2}\/[a-z][a-z0-9-]+\//,
    maxArticles: 3,
  },

  // ── Turkmenistan ────────────────────────────────────────────────────────────
  {
    name: 'TDH', regime: 'Turkmenistan', corpus: 'state', language: 'en',
    frontPage: 'https://tdh.gov.tm/en/',
    articlePattern: /^https:\/\/tdh\.gov\.tm\/en\/post\/\d{4,}\//,
    maxArticles: 3,
  },

  // ── Myanmar ─────────────────────────────────────────────────────────────────
  {
    name: 'GNLM', regime: 'Myanmar', corpus: 'state', language: 'en',
    rssUrl: 'https://www.gnlm.com.mm/feed/',
    articlePattern: /^https:\/\/www\.gnlm\.com\.mm\/[a-z][a-z0-9-]{10,}\/$/,
    maxArticles: 3,
  },

  // ── Tajikistan ──────────────────────────────────────────────────────────────
  {
    name: 'Khovar', regime: 'Tajikistan', corpus: 'state', language: 'en',
    rssUrl: 'http://eng.khovar.tj/feed/',
    articlePattern: /^https?:\/\/eng\.khovar\.tj\/\d{4}\/\d{2}\/[a-z0-9-]+\//,
    maxArticles: 3,
  },

  // ── Eswatini ────────────────────────────────────────────────────────────────
  // Owned by Tibiyo Taka Ngwane, King Mswati III's sovereign fund.
  {
    name: 'Eswatini Observer', regime: 'Eswatini', corpus: 'state', language: 'en',
    rssUrl: 'https://eswatiniobserver.com/feed/',
    articlePattern: /^https:\/\/eswatiniobserver\.com\/[a-z][a-z0-9-]{10,}\/$/,
    maxArticles: 3,
  },

  // ═══ Control corpus — public-service media in democracies ══════════════════
  // World/foreign desks only, so the topic mix resembles the state sources.
  {
    name: 'BBC World', regime: 'United Kingdom', corpus: 'control', language: 'en',
    rssUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    articlePattern: /^https:\/\/www\.bbc\.co\.uk\/news\/articles\/[a-z0-9]+$/,
    stripQuery: true,
    maxArticles: 2,
  },
  {
    name: 'Yle News', regime: 'Finland', corpus: 'control', language: 'en',
    rssUrl: 'https://yle.fi/rss/t/18-34837/en',
    articlePattern: /^https:\/\/yle\.fi\/a\/\d+-\d+$/,
    stripQuery: true,
    maxArticles: 2,
  },
  {
    name: 'Yle Uutiset', regime: 'Finland', corpus: 'control', language: 'fi',
    rssUrl: 'https://yle.fi/rss/t/18-34953/fi',
    articlePattern: /^https:\/\/yle\.fi\/a\/\d+-\d+$/,
    stripQuery: true,
    maxArticles: 2,
  },
  {
    name: 'SVT Utrikes', regime: 'Sweden', corpus: 'control', language: 'sv',
    rssUrl: 'https://www.svt.se/nyheter/utrikes/rss.xml',
    articlePattern: /^https:\/\/www\.svt\.se\/nyheter\/utrikes\/[a-z0-9-]{12,}$/,
    stripQuery: true,
    maxArticles: 2,
  },
  {
    name: 'DW', regime: 'Germany', corpus: 'control', language: 'en',
    rssUrl: 'https://rss.dw.com/rdf/rss-en-world',
    articlePattern: /^https:\/\/www\.dw\.com\/en\/[a-z0-9-]+\/a-\d+$/,
    stripQuery: true,
    maxArticles: 2,
  },
  {
    name: 'NOS', regime: 'Netherlands', corpus: 'control', language: 'nl',
    rssUrl: 'https://feeds.nos.nl/nosnieuwsbuitenland',
    articlePattern: /^https:\/\/nos\.nl\/l\/\d+$/,
    maxArticles: 2,
  },
  {
    name: 'RFI', regime: 'France', corpus: 'control', language: 'en',
    rssUrl: 'https://www.rfi.fr/en/rss',
    articlePattern: /^https:\/\/www\.rfi\.fr\/en\/(?!podcasts)[a-z-]+\/\d{8}-[a-z0-9-]+$/,
    maxArticles: 2,
  },
];

/** The monitored source a URL belongs to, or null (e.g. an outlet that has been dropped). */
export function sourceForUrl(url) {
  return SOURCES.find((s) => s.articlePattern.test(url)) ?? null;
}
