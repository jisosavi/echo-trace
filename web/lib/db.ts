import Database from 'better-sqlite3';
import { DB_PATH } from './paths';
import { getEchoVerification, type VerificationStatus } from './archive';

let _db: InstanceType<typeof Database> | null = null;

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH, { readonly: true });
  return _db;
}

export type Corpus = 'state' | 'control';

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
  corpus: Corpus;
  outcome: string | null;
  echo_id: string | null;
  similarity: number | null;
  speaker: string | null;
  speaker_type: string | null;
  claim_verbatim: number | null;
  models: string | null;
  prompt_version: string | null;
  archive_version: string | null;
};

function parseRow(row: DbRow) {
  const echo = row.historical_echo ? JSON.parse(row.historical_echo) : null;
  const verification: VerificationStatus | null = echo ? getEchoVerification(row.echo_id ?? echo.id) : null;
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
    ...(echo && { historical_echo: { ...echo, verification } }),
    ...(row.divergence_note && { divergence_note: row.divergence_note }),
    extraction_method: row.extraction_method ?? undefined,
    evidence_snippet: row.evidence_snippet ?? undefined,
    notes: row.notes ?? '',
    corpus: row.corpus ?? 'state',
    outcome: row.outcome,
    similarity: row.similarity,
    speaker: row.speaker,
    speaker_type: row.speaker_type,
    claim_verbatim: row.claim_verbatim === null ? null : row.claim_verbatim === 1,
    models: row.models ? (JSON.parse(row.models) as Record<string, string | null>) : null,
    prompt_version: row.prompt_version,
    archive_version: row.archive_version,
  };
}

export type ComparisonRecord = ReturnType<typeof parseRow>;

export function getAllComparisons(corpus: Corpus = 'state'): ComparisonRecord[] {
  const rows = getDb()
    .prepare('SELECT * FROM comparisons WHERE hidden = 0 AND corpus = ? ORDER BY timestamp DESC')
    .all(corpus) as DbRow[];
  return rows.map(parseRow);
}

export function getComparisonById(id: string): ComparisonRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM comparisons WHERE id = ? AND hidden = 0 LIMIT 1')
    .get(id) as DbRow | undefined;
  return row ? parseRow(row) : null;
}

// ── Baseline: state vs control ───────────────────────────────────────────────

export type CorpusStats = {
  analysed: number;
  propaganda: number;
  echoes: number;
  meanTopSimilarity: number | null;
  nazi: number;
  meanDehumanisation: number | null;
};

const NAZI_FIGURES = /goebbels|hitler|himmler|nazi|naujocks|quisling|reich/i;

/**
 * Only articles analysed by the current pipeline (prompt_version set) count;
 * legacy rows and extraction failures are excluded.
 */
export function getBaselineStats(): Record<Corpus, CorpusStats> {
  const db = getDb();
  const out = {} as Record<Corpus, CorpusStats>;
  for (const corpus of ['state', 'control'] as const) {
    const a = db.prepare(`
      SELECT COUNT(*) AS analysed,
             SUM(CASE WHEN is_propaganda = 1 THEN 1 ELSE 0 END) AS propaganda,
             SUM(CASE WHEN outcome = 'echo' THEN 1 ELSE 0 END) AS echoes,
             AVG(top_similarity) AS meanTop
      FROM articles
      WHERE corpus = ? AND prompt_version IS NOT NULL AND outcome IN ('echo','no_echo','not_propaganda')
    `).get(corpus) as { analysed: number; propaganda: number | null; echoes: number | null; meanTop: number | null };

    const comps = db.prepare(`
      SELECT historical_echo, analysis FROM comparisons
      WHERE corpus = ? AND prompt_version IS NOT NULL AND prompt_version != 'legacy'
    `).all(corpus) as { historical_echo: string | null; analysis: string | null }[];

    let nazi = 0, dehumSum = 0, dehumN = 0;
    for (const c of comps) {
      if (c.historical_echo && NAZI_FIGURES.test(JSON.parse(c.historical_echo).figure ?? '')) nazi++;
      const level = c.analysis ? Number(JSON.parse(c.analysis).dehumanisation_level) : NaN;
      if (Number.isFinite(level)) { dehumSum += level; dehumN++; }
    }
    out[corpus] = {
      analysed: a.analysed,
      propaganda: a.propaganda ?? 0,
      echoes: a.echoes ?? 0,
      meanTopSimilarity: a.meanTop,
      nazi,
      meanDehumanisation: dehumN ? dehumSum / dehumN : null,
    };
  }
  return out;
}

export type SourceActivity = {
  source: string;
  regime: string;
  corpus: Corpus;
  articles: number;
  analysed: number;
  echoes: number;
  lastSeen: string;
};

export function getSourceActivity(): SourceActivity[] {
  return getDb().prepare(`
    SELECT source, regime, corpus,
           COUNT(*) AS articles,
           SUM(CASE WHEN prompt_version IS NOT NULL AND outcome IN ('echo','no_echo','not_propaganda') THEN 1 ELSE 0 END) AS analysed,
           SUM(CASE WHEN outcome = 'echo' THEN 1 ELSE 0 END) AS echoes,
           MAX(retrieved_at) AS lastSeen
    FROM articles
    WHERE status != 'legacy'
    GROUP BY source, regime, corpus
    ORDER BY corpus DESC, articles DESC
  `).all() as SourceActivity[];
}

export function getTotalArticles(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM articles').get() as { n: number }).n;
}
