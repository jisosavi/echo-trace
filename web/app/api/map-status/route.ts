import { promises as fs } from 'node:fs';
import { LOG_PATH } from '@/lib/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// URL domain pattern → ISO 3166-1 numeric code (matches world-atlas topojson ids)
// State-media sources only — control-corpus outlets are deliberately not drawn on the map.
const URL_COUNTRY: [RegExp, string][] = [
  [/tass\.com|kremlin\.ru|government\.ru/,                '643'], // Russia
  [/english\.news\.cn|chinadaily|people\.cn|globaltimes\.cn/, '156'], // China
  [/belta\.by|sb\.by/,                                    '112'], // Belarus
  [/granma\.cu|prensa-latina\.cu|cubadebate\.cu/,         '192'], // Cuba
  [/presstv\.ir|tehrantimes\.com/,                        '364'], // Iran
  [/kcna\.kp/,                                             '408'], // North Korea
  [/spa\.gov\.sa/,                                         '682'], // Saudi Arabia
  [/shabait\.com/,                                        '232'], // Eritrea
  [/tdh\.gov\.tm/,                                        '795'], // Turkmenistan
  [/khovar\.tj/,                                          '762'], // Tajikistan
  [/gnlm\.com\.mm/,                                       '104'], // Myanmar
  [/eswatiniobserver\.com/,                               '748'], // Eswatini
];

function urlToCountry(url: string): string | null {
  for (const [re, code] of URL_COUNTRY) {
    if (re.test(url)) return code;
  }
  return null;
}

export type MapStatus = {
  isActive: boolean;
  isScraping: boolean;
  activeCountry: string | null;
  processedCountries: string[];
};

function parseMapStatus(content: string): MapStatus {
  const lines = content.split('\n').filter(Boolean);

  // Find last cycle start index
  let lastStartIdx = -1;
  let lastEndIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('[cycle]') && lines[i].includes('cycle=start')) lastStartIdx = i;
    if (lines[i].includes('[cycle]') && lines[i].includes('cycle=end'))   lastEndIdx   = i;
  }

  const isActive = lastStartIdx > lastEndIdx;
  const cycleLines = lines.slice(Math.max(lastStartIdx, 0));

  let isScraping = false;
  const processed = new Set<string>();
  let lastActive: string | null = null;

  for (const line of cycleLines) {
    if (line.includes('phase=scrape') && line.includes('status=started'))  isScraping = true;
    if (line.includes('phase=scrape') && line.includes('status=complete')) isScraping = false;

    const m = line.match(/analyzing url=(\S+)/);
    if (m) {
      const c = urlToCountry(m[1]);
      if (c) { processed.add(c); lastActive = c; }
    }
  }

  return {
    isActive,
    isScraping,
    activeCountry: isActive ? lastActive : null,
    processedCountries: Array.from(processed),
  };
}

export async function GET() {
  try {
    const content = await fs.readFile(LOG_PATH, 'utf8');
    return Response.json(parseMapStatus(content));
  } catch {
    return Response.json({ isActive: false, isScraping: false, activeCountry: null, processedCountries: [] });
  }
}
