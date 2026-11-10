import path from 'node:path';

/**
 * Runtime data lives outside the Next.js app, in the repo root (`../` from `web/`).
 * These files are read at request time, never bundled: the turbopackIgnore hint stops
 * the build from tracing the whole repository through process.cwd().
 */
const REPO_ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), '..');

export const DATA_DIR = path.join(REPO_ROOT, 'agent', 'data');
export const DB_PATH = path.join(DATA_DIR, 'echo-trace.db');
export const LOG_PATH = process.env.CYCLE_LOG_PATH ?? path.join(DATA_DIR, 'cycle.log');
export const ARCHIVE_PATH = path.join(REPO_ROOT, 'archival-memory.json');
