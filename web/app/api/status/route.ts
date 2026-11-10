import { promises as fs } from 'node:fs';
import { DB_PATH, LOG_PATH } from '@/lib/paths';
import Database from 'better-sqlite3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


function parseLog(content: string) {
  let lastScrape: string | null = null;
  let lastCycleStart: string | null = null;
  let lastCycleEnd: string | null = null;

  for (const line of content.split('\n')) {
    const m = line.match(/^\[([^\]]+)\]/);
    if (!m) continue;
    const ts = m[1];

    // cycle.sh marker
    if (line.includes('phase=scrape') && line.includes('status=complete')) lastScrape = ts;
    // scrape-news.mjs direct invocation marker
    if (line.includes('[scrape-news]') && line.includes('scrape cycle complete')) lastScrape = ts;

    if (line.includes('[cycle]') && line.includes('cycle=start')) lastCycleStart = ts;
    if (line.includes('[cycle]') && line.includes('cycle=end')) lastCycleEnd = ts;
  }

  const isActive =
    lastCycleStart !== null &&
    (lastCycleEnd === null || new Date(lastCycleStart) > new Date(lastCycleEnd));

  return { lastScrape, isActive };
}

function readLastAnalysis(): string | null {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    // Every analysed article counts, including ones with no comparison (not propaganda / no echo).
    const row = db.prepare(`SELECT MAX(ts) AS ts FROM (
      SELECT MAX(analyzed_at) AS ts FROM articles UNION ALL SELECT MAX(timestamp) FROM comparisons
    )`).get() as { ts: string | null };
    db.close();
    return row?.ts ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const content = await fs.readFile(LOG_PATH, 'utf8');
    const { lastScrape, isActive } = parseLog(content);
    const lastAnalysis = readLastAnalysis();
    return Response.json({ lastScrape, lastAnalysis, isActive });
  } catch {
    const lastAnalysis = readLastAnalysis();
    return Response.json({ lastScrape: null, lastAnalysis, isActive: false });
  }
}
