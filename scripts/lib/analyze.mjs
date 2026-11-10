/**
 * analyze.mjs — run one article through the pipeline and record the outcome.
 *
 *   article text
 *     → classify (source-blind; key claim, propaganda yes/no, trope, 18 dimensions)
 *     → snap the key claim to a verbatim span of the article
 *     → embed the English claim, cosine against archive echoes (always, for baseline stats)
 *     → gate: propaganda && trope && confidence ≥ 0.4
 *     → candidates with similarity ≥ ECHO_MIN_SIMILARITY (top 5)
 *     → Claude picks one by index, or -1
 *     → write comparison (outcome echo | no_echo) and update the article row
 *
 * State and control articles go through exactly this code.
 */
import { getAllEchoEmbeddings, insertComparison, updateArticle } from '../db.mjs';
import { usableEchoes, loadArchive, sha1, normForMatch, shingleOverlap } from './archive.mjs';
import { embed, cosine, hasVoyage, VOYAGE_MODEL } from './embed.mjs';
import { buildClassifier, selectEcho, translate, MODELS, PROMPT_VERSION, RefusalError } from './llm.mjs';
import { extractArticle, MIN_BODY_CHARS, normalizeWhitespace } from './extract.mjs';
import { sourceForUrl } from '../sources.mjs';
import { errMsg } from './log.mjs';

export const MIN_SIMILARITY = Number(process.env.ECHO_MIN_SIMILARITY ?? 0.45);
export const MIN_CONFIDENCE = 0.4;
const TOP_K = 5;

// ── Quote helpers ────────────────────────────────────────────────────────────

function splitSentences(text) {
  return text
    .split(/(?<=[.!?…]["”»']?)\s+(?=\p{Lu}|["“«\d])/u)
    .map(normalizeWhitespace)
    .filter((s) => s.length >= 40 && s.length <= 600);
}

function isBoilerplate(quote) {
  return /^©|all rights reserved|derechos reservados|droits réservés|sitio diseñado|cookie|subscribe/i.test(quote.trim());
}

/**
 * Return the claim as it appears in the article. If the model's copy is not
 * verbatim, use the article sentence that overlaps it most (≥ 50 %).
 */
export function snapToArticle(claim, text) {
  const c = normalizeWhitespace(claim);
  if (!c) return null;
  if (normForMatch(text).includes(normForMatch(c))) return { quote: c, verbatim: true };
  const sentences = splitSentences(text);
  let best = null, bestScore = 0;
  for (const s of sentences) {
    const score = shingleOverlap(s, c, 4);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  if (bestScore >= 0.5) return { quote: best, verbatim: false };

  // Paraphrased claim: pick the sentence containing most of the claim's content words.
  const words = (s) => new Set(normForMatch(s).split(' ').filter((w) => w.length > 3));
  const claimWords = words(c);
  if (claimWords.size === 0) return null;
  best = null; bestScore = 0;
  for (const s of sentences) {
    const sw = words(s);
    let hit = 0;
    for (const w of claimWords) if (sw.has(w) || [...sw].some((x) => x.startsWith(w.slice(0, 5)))) hit++;
    const score = hit / claimWords.size;
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return bestScore >= 0.6 ? { quote: best, verbatim: false } : null;
}

// ── Context (loaded once per process) ────────────────────────────────────────

export function createContext() {
  const { archive, version } = loadArchive();
  const echoes = usableEchoes(archive);
  const byId = new Map(echoes.map((e) => [e.id, e]));

  let vectors = [];
  let embeddingWarning = null;
  if (hasVoyage()) {
    const rows = getAllEchoEmbeddings();
    vectors = rows.filter((r) => {
      const e = byId.get(r.echo_key);
      return e && r.model === VOYAGE_MODEL && r.quote_hash === sha1(e.quote);
    });
    if (vectors.length < echoes.length) {
      embeddingWarning = `${echoes.length - vectors.length}/${echoes.length} echoes lack a current embedding — run: node scripts/precompute-embeddings.mjs`;
    }
  } else {
    embeddingWarning = 'VOYAGE_API_KEY not set — semantic matching disabled; falling back to trope-scoped echoes without similarity scores';
  }

  return { archive, archiveVersion: version, echoes, byId, vectors, embeddingWarning, classify: buildClassifier(archive) };
}

async function rankEchoes(ctx, claimEn) {
  if (ctx.vectors.length === 0) return null;
  const [q] = await embed([claimEn], 'query');
  return ctx.vectors
    .map((v) => ({ echo: ctx.byId.get(v.echo_key), score: cosine(q, v.embedding) }))
    .sort((a, b) => b.score - a.score);
}

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * @param article row from the articles table
 * @param ctx     from createContext()
 * @param log     logger
 * @returns outcome string
 */
export async function analyzeArticle(article, ctx, log) {
  const url = article.url;
  log(`analyzing url=${url} corpus=${article.corpus}`);
  const attempts = (article.attempts ?? 0) + 1;

  try {
    // 1. Text — reuse what the scraper stored; re-extract only if it is thin.
    let text = article.body ?? '';
    let method = article.extraction_method;
    if (text.length < MIN_BODY_CHARS) {
      const src = sourceForUrl(url);
      const ex = await extractArticle(url, { renderJs: !!src?.renderJs, timeout: src?.timeout });
      text = ex.text; method = ex.method;
      updateArticle(article.id, { body: text, extraction_method: method });
    }
    if (text.length < MIN_BODY_CHARS) {
      updateArticle(article.id, { status: 'skipped', outcome: 'extraction_failed', attempts, analyzed_at: new Date().toISOString() });
      log(`skipped extraction-failed url=${url} chars=${text.length}`);
      return 'extraction_failed';
    }

    // 2. Classify (source-blind).
    const cls = await ctx.classify(text);

    // 3. Quote — verbatim span of the article.
    let snapped = snapToArticle(cls.key_claim.text, text);
    let quoteEn = null, language = cls.key_claim.language, translationModel = cls.model;
    const isEnglish = /^english$/i.test(language ?? '');
    if (snapped?.verbatim) {
      quoteEn = isEnglish ? null : cls.key_claim.text_en;
    } else {
      if (!snapped) {
        const sentences = splitSentences(text);
        snapped = sentences.length ? { quote: sentences[0], verbatim: false } : null;
      }
      if (snapped && !isEnglish) {
        const tr = await translate(snapped.quote);
        language = tr.language; quoteEn = /^english$/i.test(tr.language) ? null : tr.translation;
        translationModel = tr.model;
      }
    }
    if (!snapped || isBoilerplate(snapped.quote)) {
      updateArticle(article.id, { status: 'skipped', outcome: 'extraction_failed', attempts, analyzed_at: new Date().toISOString() });
      log(`skipped no-usable-quote url=${url}`);
      return 'extraction_failed';
    }
    const quote = snapped.quote.slice(0, 600);
    const claimEn = quoteEn ?? quote;

    // 4. Similarity against the archive — computed for every article (baseline statistics).
    const ranked = await rankEchoes(ctx, claimEn);
    const topSimilarity = ranked?.[0]?.score ?? null;

    // 5. Gate.
    const trope = ctx.archive.rhetorical_tropes.find((t) => t.id === cls.trope_id) ?? null;
    const confidence = Number(cls.confidence.toFixed(2));
    const passes = cls.is_propaganda && trope && confidence >= MIN_CONFIDENCE;
    log(`classified url=${url} propaganda=${cls.is_propaganda} trope=${cls.trope_id} confidence=${confidence} top_similarity=${topSimilarity?.toFixed(3) ?? 'n/a'} speaker_type=${cls.key_claim.speaker_type}`);

    if (!passes) {
      updateArticle(article.id, {
        status: 'done', outcome: 'not_propaganda', is_propaganda: cls.is_propaganda ? 1 : 0,
        top_similarity: topSimilarity, attempts, analyzed_at: new Date().toISOString(), prompt_version: PROMPT_VERSION,
      });
      return 'not_propaganda';
    }

    // 6. Candidates and selection.
    let candidates;
    if (ranked) {
      candidates = ranked.filter((r) => r.score >= MIN_SIMILARITY).slice(0, TOP_K);
    } else {
      candidates = ctx.echoes.filter((e) => e.trope_id === trope.id).map((echo) => ({ echo, score: null }));
    }

    let chosen = null, divergence = null, sharedLogic = null, matchModel = null;
    if (candidates.length > 0) {
      const sel = await selectEcho(claimEn, candidates.map((c) => c.echo));
      matchModel = sel.model;
      sharedLogic = sel.shared_logic;
      if (sel.index >= 0) { chosen = candidates[sel.index]; divergence = sel.divergence_note; }
    }
    const outcome = chosen ? 'echo' : 'no_echo';

    // 7. Persist.
    const host = new URL(url).hostname;
    const id = `${article.corpus === 'control' ? 'ctl' : 'cmp'}-${host.replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    const e = chosen?.echo;
    insertComparison({
      id,
      timestamp: new Date().toISOString(),
      source: { publication: host, url },
      contemporary_quote: quote,
      ...(quoteEn && { contemporary_quote_en: quoteEn, translation_language: language, translation_service: `Claude ${translationModel}` }),
      historical_parallel: trope.theme,
      tropes: [trope.id],
      confidence,
      analysis: { ...cls.analysis, is_propaganda: cls.is_propaganda, rationale: cls.rationale, shared_logic: sharedLogic },
      ...(e && {
        historical_echo: { id: e.id, figure: e.figure, year: e.year ?? '', quote: e.quote, context: e.context ?? '', ...(e.source && { source: e.source }) },
        divergence_note: divergence,
      }),
      extraction_method: method,
      evidence_snippet: text.slice(0, 220),
      notes: chosen ? `Echo chosen from ${candidates.length} candidates.` : candidates.length ? `No parallel among ${candidates.length} candidates.` : `No archive echo above similarity ${MIN_SIMILARITY}.`,
      corpus: article.corpus,
      outcome,
      echo_id: e?.id ?? null,
      similarity: chosen?.score ?? null,
      speaker: cls.key_claim.speaker,
      speaker_type: cls.key_claim.speaker_type,
      claim_verbatim: snapped.verbatim,
      models: { classify: cls.model, match: matchModel, embed: ranked ? VOYAGE_MODEL : null },
      prompt_version: PROMPT_VERSION,
      archive_version: ctx.archiveVersion,
    });
    updateArticle(article.id, {
      status: 'done', outcome, is_propaganda: 1, top_similarity: topSimilarity, comparison_id: id,
      attempts, analyzed_at: new Date().toISOString(), prompt_version: PROMPT_VERSION,
    });
    log(`wrote comparison id=${id} url=${url} trope=${trope.id} outcome=${outcome}${e ? ` figure="${e.figure}" similarity=${chosen.score?.toFixed(3)}` : ''}`);
    return outcome;
  } catch (err) {
    if (err instanceof RefusalError) {
      updateArticle(article.id, { status: 'done', outcome: 'refused', attempts, last_error: err.message, analyzed_at: new Date().toISOString() });
      log(`refused url=${url} ${err.message}`);
      return 'refused';
    }
    updateArticle(article.id, { status: 'failed', attempts, last_error: errMsg(err).slice(0, 500) });
    log(`analysis-failed url=${url} attempt=${attempts} error="${errMsg(err)}"`);
    return 'error';
  }
}
