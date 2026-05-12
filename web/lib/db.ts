import Database from 'better-sqlite3';
import path from 'node:path';

const DB_PATH = path.resolve(process.cwd(), '../agent/data/echo-trace.db');

let _db: InstanceType<typeof Database> | null = null;

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH, { readonly: true });
  _db.pragma('journal_mode = WAL');
  return _db;
}

type DbRow = {
  id: string;
  timestamp: string;
  source_publication: string | null;
  source_url: string | null;
  contemporary_quote: string | null;
  contemporary_quote_en: string | null;
  translation_language: string | null;
  translation_service: string | null;
  historical_parallel: string | null;
  tropes: string | null;
  confidence: number | null;
  analysis: string | null;
  historical_echo: string | null;
  divergence_note: string | null;
  extraction_method: string | null;
  evidence_snippet: string | null;
  notes: string | null;
};

function parseRow(row: DbRow) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    source: {
      publication: row.source_publication ?? '',
      url: row.source_url ?? '',
    },
    contemporary_quote: row.contemporary_quote ?? '',
    ...(row.contemporary_quote_en && { contemporary_quote_en: row.contemporary_quote_en }),
    ...(row.translation_language && { translation_language: row.translation_language }),
    ...(row.translation_service && { translation_service: row.translation_service }),
    historical_parallel: row.historical_parallel ?? '',
    tropes: row.tropes ? (JSON.parse(row.tropes) as string[]) : [],
    confidence: row.confidence ?? 0,
    ...(row.analysis && { analysis: JSON.parse(row.analysis) }),
    ...(row.historical_echo && { historical_echo: JSON.parse(row.historical_echo) }),
    ...(row.divergence_note && { divergence_note: row.divergence_note }),
    extraction_method: row.extraction_method ?? undefined,
    evidence_snippet: row.evidence_snippet ?? undefined,
    notes: row.notes ?? '',
  };
}

export function getAllComparisons() {
  const rows = getDb()
    .prepare('SELECT * FROM comparisons ORDER BY timestamp DESC')
    .all() as DbRow[];
  return rows.map(parseRow);
}

export function getComparisonById(id: string) {
  const row = getDb()
    .prepare('SELECT * FROM comparisons WHERE id = ? LIMIT 1')
    .get(id) as DbRow | undefined;
  return row ? parseRow(row) : null;
}
