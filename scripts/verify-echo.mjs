#!/usr/bin/env node
/**
 * verify-echo.mjs — record a manual verification decision for one archive echo.
 *
 * Usage:
 *   node scripts/verify-echo.mjs <id-or-unique-prefix> <status> [notes]
 *        [--quote "exact text"] [--url https://…] [--citation "…"] [--year 1937] [--by "name"]
 *   node scripts/verify-echo.mjs --list [status]
 *
 * status: verified | translation | paraphrase | unverified | rejected
 *
 * The echo id never changes, even when the quote is corrected, so existing
 * comparisons keep pointing at it. Re-run precompute-embeddings.mjs afterwards.
 */
import { loadArchive, saveArchive, normalizeArchive, listEchoes, VERIFICATION_STATUSES } from './lib/archive.mjs';

function takeFlag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

function main() {
  const args = process.argv.slice(2);
  const { archive } = loadArchive();
  normalizeArchive(archive);

  if (args[0] === '--list') {
    const filter = args[1];
    for (const e of listEchoes(archive)) {
      if (filter && e.verification.status !== filter) continue;
      console.log(`${e.verification.status.padEnd(11)} ${e.id}  ${e.figure}${e.year ? ` (${e.year})` : ''}`);
    }
    return;
  }

  const quote = takeFlag(args, '--quote');
  const url = takeFlag(args, '--url');
  const citation = takeFlag(args, '--citation');
  const year = takeFlag(args, '--year');
  const by = takeFlag(args, '--by') ?? process.env.USER ?? null;
  const [idArg, status, ...noteParts] = args;

  if (!idArg || !VERIFICATION_STATUSES.includes(status)) {
    console.error(`Usage: verify-echo.mjs <id> <${VERIFICATION_STATUSES.join('|')}> [notes] [--quote …] [--url …] [--citation …] [--year …]`);
    process.exit(1);
  }

  const matches = [];
  for (const trope of archive.rhetorical_tropes) {
    for (const echo of trope.historical_echoes) if (echo.id === idArg || echo.id.startsWith(idArg)) matches.push(echo);
  }
  if (matches.length !== 1) {
    console.error(matches.length === 0 ? `No echo matches "${idArg}".` : `"${idArg}" is ambiguous:\n${matches.map((m) => `  ${m.id}`).join('\n')}`);
    process.exit(1);
  }

  const echo = matches[0];
  if (quote) echo.quote = quote;
  if (year) echo.year = year;
  if (url || citation) echo.source = { ...(echo.source ?? {}), ...(citation && { citation }), ...(url && { url }) };
  echo.verification = {
    ...echo.verification,
    status,
    notes: noteParts.join(' ') || echo.verification.notes,
    checked_by: by,
    checked_at: new Date().toISOString(),
  };
  saveArchive(archive);
  console.log(`${echo.id} → ${status}${quote ? ' (quote updated)' : ''}`);
  if (quote || status === 'rejected') console.log('Run: node scripts/precompute-embeddings.mjs');
}

main();
