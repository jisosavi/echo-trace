/**
 * archive.mjs — access to archival-memory.json.
 *
 * Every historical echo carries:
 *   id            stable key "<trope>:<figure-slug>:<sha1(quote)[0:8]>" — assigned once, never recomputed
 *   year          year of the quote (initially derived from context/citation; verify by hand)
 *   verification  { status, notes, checked_by, checked_at, auto }
 *
 * verification.status (set by a human, via scripts/verify-echo.mjs):
 *   verified     quote found word-for-word in the cited source
 *   translation  faithful translation of a verified original
 *   paraphrase   wording is not the figure's own; shown with a marker
 *   unverified   not yet checked (default)
 *   rejected     cannot be sourced — never used for matching
 *
 * verification.auto is written by scripts/check-archive.mjs (URL + text check).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT_DIR } from './log.mjs';

export const ARCHIVE_PATH = path.join(ROOT_DIR, 'archival-memory.json');

export const VERIFICATION_STATUSES = ['verified', 'translation', 'paraphrase', 'unverified', 'rejected'];
export const TRUSTED_STATUSES = new Set(['verified', 'translation']);

export function sha1(text) {
  return createHash('sha1').update(text).digest('hex');
}

function slugify(text) {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function makeEchoId(tropeId, figure, quote) {
  return `${tropeId}:${slugify(figure)}:${sha1(quote).slice(0, 8)}`;
}

export function deriveYear(echo) {
  for (const text of [echo.context, echo.source?.citation]) {
    const m = String(text ?? '').match(/\b(1[6-9]\d\d|20[0-2]\d)\b/);
    if (m) return m[1];
  }
  return null;
}

export function loadArchive() {
  const raw = readFileSync(ARCHIVE_PATH, 'utf8');
  return { archive: JSON.parse(raw), version: sha1(raw).slice(0, 10) };
}

export function saveArchive(archive) {
  writeFileSync(ARCHIVE_PATH, `${JSON.stringify(archive, null, 2)}\n`, 'utf8');
}

/**
 * Ensure every echo has id, year and a verification block. Idempotent.
 * Returns the number of echoes that were changed.
 */
export function normalizeArchive(archive) {
  let changed = 0;
  for (const trope of archive.rhetorical_tropes) {
    trope.historical_echoes = (trope.historical_echoes ?? []).map((echo) => {
      const before = JSON.stringify(echo);
      const { id, figure, year, quote, verification, ...rest } = echo;
      const normalized = {
        id: id ?? makeEchoId(trope.id, figure, quote),
        figure,
        year: year ?? deriveYear(echo),
        quote,
        ...rest,
        verification: {
          status: 'unverified',
          notes: '',
          checked_by: null,
          checked_at: null,
          auto: null,
          ...(verification ?? {}),
        },
      };
      if (JSON.stringify(normalized) !== before) changed++;
      return normalized;
    });
  }
  return changed;
}

/** Flat list of echoes with their trope attached. */
export function listEchoes(archive) {
  const out = [];
  for (const trope of archive.rhetorical_tropes) {
    for (const echo of trope.historical_echoes ?? []) {
      out.push({ ...echo, trope_id: trope.id, trope_theme: trope.theme });
    }
  }
  return out;
}

/**
 * Echoes eligible for matching. Rejected echoes are always excluded;
 * ECHO_REQUIRE_VERIFIED=1 limits matching to verified/translation only.
 */
export function usableEchoes(archive) {
  const requireVerified = process.env.ECHO_REQUIRE_VERIFIED === '1';
  return listEchoes(archive).filter((e) => {
    const status = e.verification?.status ?? 'unverified';
    if (status === 'rejected') return false;
    if (requireVerified && !TRUSTED_STATUSES.has(status)) return false;
    return true;
  });
}

/** Text normalisation used for quote comparison. */
export function normForMatch(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’‚‛′`]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Fraction of the quote's word 6-grams that appear in the haystack (0–1). */
export function shingleOverlap(quote, haystack, n = 6) {
  const words = normForMatch(quote).split(' ').filter(Boolean);
  const hay = normForMatch(haystack);
  if (words.length < n) return hay.includes(words.join(' ')) ? 1 : 0;
  let hit = 0, total = 0;
  for (let i = 0; i + n <= words.length; i++) {
    total++;
    if (hay.includes(words.slice(i, i + n).join(' '))) hit++;
  }
  return total ? hit / total : 0;
}
