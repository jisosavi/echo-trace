import { readFileSync, statSync } from 'node:fs';
import { ARCHIVE_PATH } from './paths';

/**
 * Live verification status of archive echoes, read from archival-memory.json
 * (re-read when the file changes), so a manual verification shows up without
 * re-running the pipeline.
 */
export type VerificationStatus = 'verified' | 'translation' | 'paraphrase' | 'unverified' | 'rejected';

let cache: { mtimeMs: number; byId: Map<string, VerificationStatus>; tropeCount: number } | null = null;

function load(): { byId: Map<string, VerificationStatus>; tropeCount: number } {
  try {
    const { mtimeMs } = statSync(ARCHIVE_PATH);
    if (cache && cache.mtimeMs === mtimeMs) return cache;
    const archive = JSON.parse(readFileSync(ARCHIVE_PATH, 'utf8')) as {
      rhetorical_tropes: { historical_echoes?: { id?: string; verification?: { status?: VerificationStatus } }[] }[];
    };
    const byId = new Map<string, VerificationStatus>();
    for (const trope of archive.rhetorical_tropes) {
      for (const echo of trope.historical_echoes ?? []) {
        if (echo.id) byId.set(echo.id, echo.verification?.status ?? 'unverified');
      }
    }
    cache = { mtimeMs, byId, tropeCount: archive.rhetorical_tropes.length };
    return cache;
  } catch {
    return { byId: new Map(), tropeCount: 0 };
  }
}

export function getEchoVerification(id: string | null | undefined): VerificationStatus {
  if (!id) return 'unverified';
  return load().byId.get(id) ?? 'unverified';
}

export function isTrusted(status: VerificationStatus | null | undefined) {
  return status === 'verified' || status === 'translation';
}

/** Number of tropes defined in the archive taxonomy. */
export function getTropeCount(): number {
  return load().tropeCount;
}
