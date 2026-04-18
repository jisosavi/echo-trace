import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOG_PATH = process.env.CYCLE_LOG_PATH ??
  path.resolve(process.cwd(), '../agent/data/cycle.log');

function parseStatus(content: string) {
  let lastScrape: string | null = null;
  let lastAnalysis: string | null = null;
  let lastCycleStart: string | null = null;
  let lastCycleEnd: string | null = null;

  for (const line of content.split('\n')) {
    const m = line.match(/^\[([^\]]+)\]/);
    if (!m) continue;
    const ts = m[1];

    if (line.includes('phase=scrape') && line.includes('status=complete')) lastScrape = ts;
    if (line.includes('phase=analyze') && line.includes('status=complete')) lastAnalysis = ts;
    if (line.includes('[cycle]') && line.includes('cycle=start')) lastCycleStart = ts;
    if (line.includes('[cycle]') && line.includes('cycle=end')) lastCycleEnd = ts;
  }

  const isActive =
    lastCycleStart !== null &&
    (lastCycleEnd === null || new Date(lastCycleStart) > new Date(lastCycleEnd));

  return { lastScrape, lastAnalysis, isActive };
}

export async function GET() {
  try {
    const content = await fs.readFile(LOG_PATH, 'utf8');
    return Response.json(parseStatus(content));
  } catch {
    return Response.json({ lastScrape: null, lastAnalysis: null, isActive: false });
  }
}
