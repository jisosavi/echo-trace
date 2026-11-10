/**
 * llm.mjs — Claude calls: classify an article, select a historical echo, translate.
 *
 * Methodological rules (see README → Method):
 *  - Prompts are source-blind: the outlet, country and corpus are never sent,
 *    and nothing tells the model the text comes from an authoritarian outlet.
 *    State and control articles are processed identically.
 *  - "Not propaganda" and "no adequate parallel" are first-class answers.
 *  - The model chooses a historical echo by index only; quote, figure, year,
 *    context and citation are copied from the archive, never re-typed.
 *  - Structured outputs (JSON schema) instead of regex-parsed JSON.
 *
 * Bump PROMPT_VERSION whenever a prompt or schema changes; it is stored on
 * every comparison so stale entries can be found and re-run.
 */
import Anthropic from '@anthropic-ai/sdk';

export const PROMPT_VERSION = '2026-11-09.1';

export const MODELS = {
  classify: process.env.ECHO_MODEL_CLASSIFY ?? 'claude-sonnet-5-5',
  match: process.env.ECHO_MODEL_MATCH ?? 'claude-sonnet-5-5',
  translate: process.env.ECHO_MODEL_TRANSLATE ?? 'claude-haiku-5-5',
};

// Server-side refusal fallback (Claude API only). Disable with ECHO_FALLBACKS=0.
const USE_FALLBACKS = process.env.ECHO_FALLBACKS !== '0';

let _client = null;
function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

export class RefusalError extends Error {}

/** One structured-output call; returns the parsed JSON object. */
async function structuredCall({ model, effort, system, user, schema, maxTokens = 16000 }) {
  const params = {
    model,
    max_tokens: maxTokens,
    output_config: { effort, format: { type: 'json_schema', schema } },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  };
  const fallbackOk = USE_FALLBACKS && model.startsWith('claude-sonnet-5-5');
  const response = fallbackOk
    ? await client().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await client().messages.create(params);

  if (response.stop_reason === 'refusal') {
    throw new RefusalError(`model refused (${response.stop_details?.category ?? 'no category'})`);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('response truncated at max_tokens');
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('no text block in response');
  return { data: JSON.parse(text), model: response.model };
}

// ── Classification ───────────────────────────────────────────────────────────

const SCALAR_DIMS = ['narrative_strategy', 'nimmo_4d', 'ellul_type', 'ellul_axis', 'myth_function', 'enemy_type', 'frame_function', 'temporality'];
const ARRAY_DIMS = ['san_martino_techniques', 'ipa_techniques', 'eco_properties', 'eudisinfo_narratives', 'eudisinfo_rhetoric', 'eudisinfo_conspiracy', 'eudisinfo_ttp', 'legitimation_mode'];

export const SPEAKER_TYPES = [
  'head_of_state_or_government', 'government_official', 'outlet_editorial_voice',
  'foreign_official', 'opposition_or_critic', 'expert_or_commentator', 'ordinary_person', 'unknown',
];

function describeDimension(name, dim) {
  const lines = [`### ${name}`, dim.description];
  if (dim.notes) lines.push(dim.notes);
  if (dim.values) lines.push(`Values: ${dim.values.join(' | ')}`);
  if (dim.roles) lines.push(`Roles: ${Object.entries(dim.roles).map(([k, v]) => `${k} = ${v}`).join('; ')}`);
  lines.push(`Source: ${dim.source ?? ''}`);
  return lines.join('\n');
}

export function buildClassifier(archive) {
  const dims = archive._meta.dimensions;
  const tropes = archive.rhetorical_tropes;
  const tropeIds = tropes.map((t) => t.id);

  const system = `You are a rhetorical analyst. You read one news text at a time and describe its rhetoric using established academic taxonomies. You do not know which outlet or country the text comes from, and you must not guess: judge only the language on the page.

Most news writing is informational. Answer is_propaganda = false when the text mainly reports events, figures or statements without itself using manipulative persuasion; quoting a politician is not propaganda by itself. Answer true only when the key claim (in the outlet's own voice, or a statement the outlet amplifies without distance) uses persuasion techniques to advance a political agenda — loaded framing, enemy construction, fear appeals, glorification, denial, conspiracy, and similar.

## Step 1 — key claim
Pick the single sentence (or two adjacent sentences) that carries the text's main political framing. Prefer the outlet's own framing or statements it amplifies; never pick a statement the text quotes in order to rebut it. Copy it EXACTLY as it appears in the text, in the original language — do not paraphrase, shorten or fix typos. Give its speaker (name and role, or "outlet" for the editorial voice), the language, and a formal UK English translation (or repeat the text if already English).

## Step 2 — trope
Choose the closest trope id from the list below, or "none" if no trope fits. Confidence is your probability (0–1) that the trope assignment is correct.

${tropes.map((t) => `- ${t.id}: ${t.theme}`).join('\n')}

## Step 3 — analytical dimensions
Fill every dimension. Use "none" (scalars), [] (lists) or 0 (dehumanisation_level) when the dimension does not apply — do not stretch the text to fit. Only select DISARM TTPs that can be detected from the text itself.

${Object.entries(dims).map(([k, v]) => describeDimension(k, v)).join('\n\n')}`;

  const enumWithNone = (values) => ({ type: 'string', enum: [...values, 'none'] });
  const arrayOf = (values) => ({ type: 'array', items: { type: 'string', enum: values } });

  const analysisProps = { theme: { type: 'string', description: 'One-line description of the rhetorical theme.' } };
  for (const d of SCALAR_DIMS) analysisProps[d] = enumWithNone(dims[d].values);
  for (const d of ARRAY_DIMS) analysisProps[d] = arrayOf(dims[d].values);
  analysisProps.dehumanisation_level = { type: 'integer', description: '0 = none, otherwise 1–10 on Stanton\'s scale.' };
  const roles = Object.keys(dims.greimas_actantial?.roles ?? { subject: 1, object: 1, sender: 1, receiver: 1, helper: 1, opponent: 1 });
  analysisProps.greimas_actantial = {
    type: 'object',
    properties: Object.fromEntries(roles.map((r) => [r, { type: 'string' }])),
    required: roles,
    additionalProperties: false,
  };

  const schema = {
    type: 'object',
    properties: {
      key_claim: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          speaker: { type: 'string' },
          speaker_type: { type: 'string', enum: SPEAKER_TYPES },
          language: { type: 'string', description: 'Language name in English, e.g. "Spanish".' },
          text_en: { type: 'string' },
        },
        required: ['text', 'speaker', 'speaker_type', 'language', 'text_en'],
        additionalProperties: false,
      },
      is_propaganda: { type: 'boolean' },
      rationale: { type: 'string', description: 'Two sentences at most.' },
      trope_id: { type: 'string', enum: [...tropeIds, 'none'] },
      confidence: { type: 'number' },
      analysis: {
        type: 'object',
        properties: analysisProps,
        required: Object.keys(analysisProps),
        additionalProperties: false,
      },
    },
    required: ['key_claim', 'is_propaganda', 'rationale', 'trope_id', 'confidence', 'analysis'],
    additionalProperties: false,
  };

  return async function classify(articleText) {
    const { data, model } = await structuredCall({
      model: MODELS.classify,
      effort: 'medium',
      system,
      schema,
      user: `<text>\n${articleText.slice(0, 15000)}\n</text>`,
    });
    data.confidence = Math.max(0, Math.min(1, Number(data.confidence) || 0));
    data.analysis.dehumanisation_level = Math.max(0, Math.min(10, Math.round(data.analysis.dehumanisation_level || 0)));
    // Store "none" as absent so dashboards don't count it as a category.
    for (const d of SCALAR_DIMS) if (data.analysis[d] === 'none') delete data.analysis[d];
    return { ...data, model };
  };
}

// ── Echo selection ───────────────────────────────────────────────────────────

const MATCH_SYSTEM = `You compare the rhetorical structure of a contemporary statement with a short list of historical statements.

A parallel exists only when both statements share the same rhetorical logic or emotional mechanism — for example, the same way of constructing an enemy, of denying responsibility, of glorifying a leader, or of turning criticism into an attack on the nation. Shared topic or shared vocabulary alone is NOT a parallel.

Choose the index of the closest parallel, or -1 if none of the candidates shares the rhetorical logic. Choosing -1 is a normal, expected answer.

If you choose a candidate, write a divergence note (1–2 sentences, clinical tone): how the contemporary wording differs from the historical one — vocabulary, framing, implied audience, technology, euphemism. Do not editorialise. If you choose -1, the divergence note is an empty string.`;

const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    echo_index: { type: 'integer', description: 'Index of the chosen candidate, or -1.' },
    shared_logic: { type: 'string', description: 'One sentence naming the shared rhetorical mechanism, or why none fits.' },
    divergence_note: { type: 'string' },
  },
  required: ['echo_index', 'shared_logic', 'divergence_note'],
  additionalProperties: false,
};

export async function selectEcho(claimEn, candidates) {
  const list = candidates
    .map((c, i) => `[${i}] ${c.figure}${c.year ? ` (${c.year})` : ''} — ${c.context ?? ''}\n"${c.quote}"`)
    .join('\n\n');
  const { data, model } = await structuredCall({
    model: MODELS.match,
    effort: 'medium',
    system: MATCH_SYSTEM,
    schema: MATCH_SCHEMA,
    maxTokens: 8000,
    user: `Contemporary statement:\n"${claimEn}"\n\nHistorical candidates:\n\n${list}`,
  });
  const idx = Number.isInteger(data.echo_index) && data.echo_index >= 0 && data.echo_index < candidates.length
    ? data.echo_index
    : -1;
  return { index: idx, shared_logic: data.shared_logic, divergence_note: idx >= 0 ? data.divergence_note : '', model };
}

// ── Translation (only for fallback quotes the classifier did not translate) ──

const TRANSLATE_SCHEMA = {
  type: 'object',
  properties: { language: { type: 'string' }, translation: { type: 'string' } },
  required: ['language', 'translation'],
  additionalProperties: false,
};

export async function translate(text) {
  const { data, model } = await structuredCall({
    model: MODELS.translate,
    effort: 'low',
    system: 'Detect the language of the text. Give its name in English and a formal UK English translation. If it is already English, return it unchanged.',
    schema: TRANSLATE_SCHEMA,
    maxTokens: 4000,
    user: text,
  });
  return { ...data, model };
}
