/**
 * embed.mjs — Voyage AI embeddings.
 *
 * Archive quotes are embedded as `document`, contemporary claims as `query`
 * (asymmetric retrieval). Only the quote text is embedded — no figure name,
 * so "Goebbels" in the text does not pull matches toward Goebbels.
 * Contemporary claims are embedded in English (translated when needed) so both
 * sides share a language.
 */
export const VOYAGE_MODEL = process.env.VOYAGE_MODEL ?? 'voyage-3.5-lite';
const VOYAGE_BATCH = 128;

export function hasVoyage() {
  return !!process.env.VOYAGE_API_KEY;
}

export async function embed(texts, inputType) {
  const out = [];
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
    const batch = texts.slice(i, i + VOYAGE_BATCH);
    let res;
    // Accounts without a payment method are limited to 3 requests/minute — back off on 429.
    for (let attempt = 0; ; attempt++) {
      res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
        body: JSON.stringify({ model: VOYAGE_MODEL, input: batch, input_type: inputType }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.status !== 429 || attempt >= 5) break;
      const wait = Number(res.headers.get('retry-after')) * 1000 || 21000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, wait));
    }
    if (!res.ok) throw new Error(`Voyage embed error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    out.push(...json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
  }
  return out;
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
