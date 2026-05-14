import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
export const DB_PATH = path.join(ROOT_DIR, 'agent/data/echo-trace.db');

let _db = null;

export function getDb() {
  if (_db) return _db;
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS comparisons (
      id                    TEXT PRIMARY KEY,
      timestamp             TEXT NOT NULL,
      source_publication    TEXT,
      source_url            TEXT,
      contemporary_quote    TEXT,
      contemporary_quote_en TEXT,
      translation_language  TEXT,
      translation_service   TEXT,
      historical_parallel   TEXT,
      tropes                TEXT,
      confidence            REAL,
      analysis              TEXT,
      historical_echo       TEXT,
      divergence_note       TEXT,
      extraction_method     TEXT,
      evidence_snippet      TEXT,
      notes                 TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ts  ON comparisons(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_url ON comparisons(source_url);

    CREATE TABLE IF NOT EXISTS echo_embeddings (
      echo_key   TEXT PRIMARY KEY,
      trope_id   TEXT NOT NULL,
      figure     TEXT NOT NULL,
      quote      TEXT NOT NULL,
      context    TEXT,
      source     TEXT,
      embedding  BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ee_trope ON echo_embeddings(trope_id);
  `);
  return _db;
}

const INSERT_SQL = `
  INSERT OR IGNORE INTO comparisons
  (id, timestamp, source_publication, source_url, contemporary_quote,
   contemporary_quote_en, translation_language, translation_service,
   historical_parallel, tropes, confidence, analysis, historical_echo,
   divergence_note, extraction_method, evidence_snippet, notes)
  VALUES
  (@id, @timestamp, @source_publication, @source_url, @contemporary_quote,
   @contemporary_quote_en, @translation_language, @translation_service,
   @historical_parallel, @tropes, @confidence, @analysis, @historical_echo,
   @divergence_note, @extraction_method, @evidence_snippet, @notes)
`;

export function insertComparison(entry) {
  getDb().prepare(INSERT_SQL).run({
    id: entry.id,
    timestamp: entry.timestamp,
    source_publication: entry.source?.publication ?? null,
    source_url: entry.source?.url ?? null,
    contemporary_quote: entry.contemporary_quote ?? null,
    contemporary_quote_en: entry.contemporary_quote_en ?? null,
    translation_language: entry.translation_language ?? null,
    translation_service: entry.translation_service ?? null,
    historical_parallel: entry.historical_parallel ?? null,
    tropes: JSON.stringify(entry.tropes ?? []),
    confidence: entry.confidence ?? null,
    analysis: entry.analysis ? JSON.stringify(entry.analysis) : null,
    historical_echo: entry.historical_echo ? JSON.stringify(entry.historical_echo) : null,
    divergence_note: entry.divergence_note ?? null,
    extraction_method: entry.extraction_method ?? null,
    evidence_snippet: entry.evidence_snippet ?? null,
    notes: entry.notes ?? null,
  });
}

export function existsByUrlAndQuote(url, quote) {
  return !!getDb()
    .prepare('SELECT 1 FROM comparisons WHERE source_url = ? AND contemporary_quote = ? LIMIT 1')
    .get(url, quote);
}

export function getAllUrls() {
  return new Set(
    getDb()
      .prepare('SELECT source_url FROM comparisons WHERE source_url IS NOT NULL')
      .all()
      .map((r) => r.source_url)
  );
}

export function upsertEchoEmbedding({ echo_key, trope_id, figure, quote, context, source, embedding }) {
  getDb().prepare(`
    INSERT INTO echo_embeddings (echo_key, trope_id, figure, quote, context, source, embedding)
    VALUES (@echo_key, @trope_id, @figure, @quote, @context, @source, @embedding)
    ON CONFLICT(echo_key) DO UPDATE SET
      trope_id  = excluded.trope_id,
      figure    = excluded.figure,
      quote     = excluded.quote,
      context   = excluded.context,
      source    = excluded.source,
      embedding = excluded.embedding
  `).run({
    echo_key,
    trope_id,
    figure,
    quote,
    context: context ?? null,
    source: source ? JSON.stringify(source) : null,
    embedding: Buffer.from(new Float32Array(embedding).buffer),
  });
}

export function getAllEchoEmbeddings() {
  return getDb()
    .prepare('SELECT echo_key, trope_id, figure, quote, context, source, embedding FROM echo_embeddings')
    .all()
    .map((row) => ({
      echo_key: row.echo_key,
      trope_id: row.trope_id,
      figure: row.figure,
      quote: row.quote,
      context: row.context,
      source: row.source ? JSON.parse(row.source) : null,
      embedding: Array.from(new Float32Array(row.embedding.buffer ?? row.embedding)),
    }));
}
