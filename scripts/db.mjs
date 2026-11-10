import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './lib/log.mjs';

export const DB_PATH = path.join(DATA_DIR, 'echo-trace.db');

let _db = null;

/** Add a column only if it is missing (SQLite has no ADD COLUMN IF NOT EXISTS). */
function ensureColumn(db, table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

export function getDb() {
  if (_db) return _db;
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    -- One row per scraped article. Pipeline state lives here.
    --   status:  pending → done | failed (retried up to 3×) | skipped | legacy
    --   outcome: echo | no_echo | not_propaganda | extraction_failed | refused | error
    CREATE TABLE IF NOT EXISTS articles (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      url               TEXT NOT NULL UNIQUE,
      source            TEXT,
      regime            TEXT,
      corpus            TEXT NOT NULL DEFAULT 'state',
      language          TEXT,
      title             TEXT,
      published_at      TEXT,
      retrieved_at      TEXT NOT NULL,
      body              TEXT,
      extraction_method TEXT,
      status            TEXT NOT NULL DEFAULT 'pending',
      attempts          INTEGER NOT NULL DEFAULT 0,
      last_error        TEXT,
      analyzed_at       TEXT,
      outcome           TEXT,
      is_propaganda     INTEGER,
      top_similarity    REAL,
      comparison_id     TEXT,
      prompt_version    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
    CREATE INDEX IF NOT EXISTS idx_articles_corpus ON articles(corpus, outcome);

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

  // v3 columns — provenance and control-corpus support.
  ensureColumn(_db, 'comparisons', 'corpus', "TEXT NOT NULL DEFAULT 'state'");
  ensureColumn(_db, 'comparisons', 'outcome', 'TEXT');           // echo | no_echo
  ensureColumn(_db, 'comparisons', 'echo_id', 'TEXT');           // archive echo id
  ensureColumn(_db, 'comparisons', 'similarity', 'REAL');        // cosine of chosen echo
  ensureColumn(_db, 'comparisons', 'speaker', 'TEXT');
  ensureColumn(_db, 'comparisons', 'speaker_type', 'TEXT');
  ensureColumn(_db, 'comparisons', 'claim_verbatim', 'INTEGER'); // 1 = found verbatim in article
  ensureColumn(_db, 'comparisons', 'models', 'TEXT');            // JSON {classify, match, embed}
  ensureColumn(_db, 'comparisons', 'prompt_version', 'TEXT');
  ensureColumn(_db, 'comparisons', 'archive_version', 'TEXT');
  ensureColumn(_db, 'comparisons', 'hidden', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(_db, 'echo_embeddings', 'model', 'TEXT');
  ensureColumn(_db, 'echo_embeddings', 'quote_hash', 'TEXT');

  return _db;
}

// ── Articles ─────────────────────────────────────────────────────────────────

export function articleExists(url) {
  return !!getDb().prepare('SELECT 1 FROM articles WHERE url = ?').get(url);
}

export function insertArticle(a) {
  return getDb().prepare(`
    INSERT OR IGNORE INTO articles
      (url, source, regime, corpus, language, title, published_at, retrieved_at,
       body, extraction_method, status, outcome, last_error)
    VALUES
      (@url, @source, @regime, @corpus, @language, @title, @published_at, @retrieved_at,
       @body, @extraction_method, @status, @outcome, @last_error)
  `).run({
    url: a.url,
    source: a.source ?? null,
    regime: a.regime ?? null,
    corpus: a.corpus ?? 'state',
    language: a.language ?? null,
    title: a.title ?? null,
    published_at: a.published_at ?? null,
    retrieved_at: a.retrieved_at ?? new Date().toISOString(),
    body: a.body ?? null,
    extraction_method: a.extraction_method ?? null,
    status: a.status ?? 'pending',
    outcome: a.outcome ?? null,
    last_error: a.last_error ?? null,
  });
}

export function getArticleByUrl(url) {
  return getDb().prepare('SELECT * FROM articles WHERE url = ?').get(url) ?? null;
}

/** Articles waiting for analysis, plus failed ones with retries left. */
export function getPendingArticles(limit = 1e9, corpus = null) {
  return getDb().prepare(`
    SELECT * FROM articles
    WHERE (status = 'pending' OR (status = 'failed' AND attempts < 3))
      AND (@corpus IS NULL OR corpus = @corpus)
    ORDER BY retrieved_at ASC
    LIMIT @limit
  `).all({ limit, corpus });
}

export function updateArticle(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const set = keys.map((k) => `${k} = @${k}`).join(', ');
  getDb().prepare(`UPDATE articles SET ${set} WHERE id = @id`).run({ ...fields, id });
}

// ── Comparisons ──────────────────────────────────────────────────────────────

const INSERT_SQL = `
  INSERT OR IGNORE INTO comparisons
  (id, timestamp, source_publication, source_url, contemporary_quote,
   contemporary_quote_en, translation_language, translation_service,
   historical_parallel, tropes, confidence, analysis, historical_echo,
   divergence_note, extraction_method, evidence_snippet, notes,
   corpus, outcome, echo_id, similarity, speaker, speaker_type, claim_verbatim,
   models, prompt_version, archive_version, hidden)
  VALUES
  (@id, @timestamp, @source_publication, @source_url, @contemporary_quote,
   @contemporary_quote_en, @translation_language, @translation_service,
   @historical_parallel, @tropes, @confidence, @analysis, @historical_echo,
   @divergence_note, @extraction_method, @evidence_snippet, @notes,
   @corpus, @outcome, @echo_id, @similarity, @speaker, @speaker_type, @claim_verbatim,
   @models, @prompt_version, @archive_version, 0)
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
    corpus: entry.corpus ?? 'state',
    outcome: entry.outcome ?? null,
    echo_id: entry.echo_id ?? null,
    similarity: entry.similarity ?? null,
    speaker: entry.speaker ?? null,
    speaker_type: entry.speaker_type ?? null,
    claim_verbatim: entry.claim_verbatim == null ? null : entry.claim_verbatim ? 1 : 0,
    models: entry.models ? JSON.stringify(entry.models) : null,
    prompt_version: entry.prompt_version ?? null,
    archive_version: entry.archive_version ?? null,
  });
}

// ── Echo embeddings ──────────────────────────────────────────────────────────

export function upsertEchoEmbedding({ echo_key, trope_id, figure, quote, context, source, embedding, model, quote_hash }) {
  getDb().prepare(`
    INSERT INTO echo_embeddings (echo_key, trope_id, figure, quote, context, source, embedding, model, quote_hash)
    VALUES (@echo_key, @trope_id, @figure, @quote, @context, @source, @embedding, @model, @quote_hash)
    ON CONFLICT(echo_key) DO UPDATE SET
      trope_id   = excluded.trope_id,
      figure     = excluded.figure,
      quote      = excluded.quote,
      context    = excluded.context,
      source     = excluded.source,
      embedding  = excluded.embedding,
      model      = excluded.model,
      quote_hash = excluded.quote_hash
  `).run({
    echo_key,
    trope_id,
    figure,
    quote,
    context: context ?? null,
    source: source ? JSON.stringify(source) : null,
    embedding: Buffer.from(new Float32Array(embedding).buffer),
    model: model ?? null,
    quote_hash: quote_hash ?? null,
  });
}

export function deleteEchoEmbeddingsExcept(keys) {
  const keep = new Set(keys);
  const db = getDb();
  const del = db.prepare('DELETE FROM echo_embeddings WHERE echo_key = ?');
  let n = 0;
  for (const { echo_key } of db.prepare('SELECT echo_key FROM echo_embeddings').all()) {
    if (!keep.has(echo_key)) { del.run(echo_key); n++; }
  }
  return n;
}

export function getAllEchoEmbeddings() {
  return getDb()
    .prepare('SELECT echo_key, trope_id, figure, quote, context, source, embedding, model, quote_hash FROM echo_embeddings')
    .all()
    .map((row) => ({
      echo_key: row.echo_key,
      trope_id: row.trope_id,
      figure: row.figure,
      quote: row.quote,
      context: row.context,
      source: row.source ? JSON.parse(row.source) : null,
      model: row.model,
      quote_hash: row.quote_hash,
      embedding: new Float32Array(
        row.embedding.buffer.slice(row.embedding.byteOffset, row.embedding.byteOffset + row.embedding.byteLength)
      ),
    }));
}
