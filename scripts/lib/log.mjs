import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(ROOT_DIR, 'agent/data');
export const LOG_PATH = path.join(DATA_DIR, 'cycle.log');

/**
 * Append one line to cycle.log. The web console and map parse these lines
 * (`analyzing url=…`, `scraped url=…`), so keep those prefixes stable.
 */
export function makeLogger(component) {
  mkdirSync(DATA_DIR, { recursive: true });
  return (message) => {
    appendFileSync(LOG_PATH, `[${new Date().toISOString()}] [${component}] ${message}\n`, 'utf8');
  };
}

export function errMsg(err) {
  return err instanceof Error ? err.message : String(err);
}
