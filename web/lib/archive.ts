import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Live verification status of archive echoes, read from archival-memory.json
 * (re-read when the file changes), so a manual verification shows up without
 * re-running the pipeline.
 */
export type VerificationStatus = 'verified' | 'translation' | 'paraphrase' | 'unverified' | 'rejected';

const ARCHIVE_PATH = path.resolve(process.cwd(), '../archival-memory.json');

let cache: { mtimeMs: number; byId: Map<string, VerificationStatus> } | null = null;

function load(): Map<string, VerificationStatus> {
  try {
    const { mtimeMs } = statSync(ARCHIVE_PATH);
    if (cache && cache.mtimeMs === mtimeMs) return cache.byId;
    const archive = JSON.parse(readFileSync(ARCHIVE_PATH, 'utf8')) as {
      rhetorical_tropes: { historical_echoes?: { id?: string; verification?: { status?: VerificationStatus } }[] }[];
    };
    const byId = new Map<string, VerificationStatus>();
    for (const trope of archive.rhetorical_tropes) {
      for (const echo of trope.historical_echoes ?? []) {
        if (echo.id) byId.set(echo.id, echo.verification?.status ?? 'unverified');
      }
    }
    cache = { mtimeMs, byId };
    return byId;
  } catch {
    return new Map();
  }
}

export function getEchoVerification(id: string | null | undefined): VerificationStatus {
  if (!id) return 'unverified';
  return load().get(id) ?? 'unverified';
}

export function isTrusted(status: VerificationStatus | null | undefined) {
  return status === 'verified' || status === 'translation';
}
