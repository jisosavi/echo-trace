# ECHO/trace

**Authoritarian propaganda does not invent new language. It inherits it.**

ECHO/trace is an autonomous AI-powered pattern-matching system that exposes this inheritance in real time. Every six hours, it scrapes 30+ state media outlets across authoritarian regimes, identifies rhetorical patterns using a 22-trope taxonomy, and matches them against a curated archive of 88 historically documented quotes from over 30 figures spanning dictatorships of the 20th and 21st centuries.

The output: forensic pairings that juxtapose today's propaganda with its structural ancestors — a Putin spokesman echoing Goebbels, Chinese state media recycling Stalin, Iranian broadcasts mirroring Mussolini.

## How it works

The system operates as a digital archaeologist, analyzing each article across 18 scientific dimensions drawn from propaganda studies, semiotics, and genocide prevention research. It searches for structural DNA matches across an archive reaching from Nazi Germany and Stalinist USSR to Pinochet's Chile, Gaddafi's Libya, apartheid South Africa, and the military juntas of Latin America — using semantic vector search to find rhetorical parallels regardless of which regime or era they come from.

The analysis is clinical; the conclusions are implicit in the parallelism.

Just parallel quotes, timestamped and traced.

**Making inheritance visible is the point.**

---

## Screenshots

**Live Console — real-time scraping log and world map**

![Live Console](docs/screenshots/live-console.png)

**Dashboard — trope distribution and analytical framing**

![Dashboard](docs/screenshots/dashboard.png)

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Architecture](#architecture)
3. [Analytical Dimensions](#analytical-dimensions)
4. [Trope Taxonomy](#trope-taxonomy)
5. [Monitored Sources](#monitored-sources)
6. [Setup](#setup)
7. [Running](#running)
8. [Web Frontend](#web-frontend)
9. [Tech Stack](#tech-stack)
10. [Data Formats](#data-formats)

---

## What It Does

1. **Scrapes** headlines and article bodies from 30+ state-controlled media outlets across a dozen authoritarian regimes
2. **Classifies** each article against a 22-trope rhetorical taxonomy using Claude Haiku (fast triage) and Claude Sonnet (deep multi-dimensional analysis)
3. **Matches** a modern quote against 88 historically documented quotes spanning 30+ figures from Stalin and Goebbels to Pinochet, Gaddafi, Khamenei, and Mugabe — using Voyage AI semantic embeddings for cross-trope retrieval, with Claude selecting the closest rhetorical parallel from the top-5 candidates
4. **Annotates** each match across 18 analytical dimensions drawn from propaganda studies, semiotics, political myth theory, and genocide prevention research
5. **Translates** non-English quotes to UK English (auto-detected; original language preserved alongside)
6. **Publishes** results to a Next.js gallery — each entry showing the modern quote, its historical echo with source citation, divergence note, and full multi-dimensional analysis
7. **Streams** live execution logs to the Live Console at `/console`, with a real-time world map showing which countries are being scraped

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Crontab (every 6 hours)                                        │
│    └─ scripts/cycle.sh                                          │
│         │                                                       │
│         ├─ Phase 1: scrape-news.mjs                             │
│         │    Fetches 30+ sources → emits new article URLs       │
│         │                                                       │
│         └─ Phase 2: loop over new URLs                          │
│              analyze-one-url.mjs <URL>                          │
│                │                                                │
│                ├─ Extract article text                          │
│                │    (Readability → JSON-LD → DOM → Puppeteer)   │
│                │                                                │
│                ├─ Classify trope (Claude Haiku)                 │
│                │    → 22-trope archival-memory.json taxonomy    │
│                │                                                │
│                ├─ Find historical echo (Voyage AI + Claude)     │
│                │    1. Embed modern quote (voyage-3-lite)        │
│                │    2. Cosine similarity → top-5 across all 88  │
│                │       echoes (cross-trope)                     │
│                │    3. Claude selects best rhetorical parallel  │
│                │       + writes divergence note                 │
│                │                                                │
│                ├─ Multi-dimensional analysis (Claude Sonnet)    │
│                │    → 18 analytical dimensions                  │
│                │                                                │
│                ├─ Translate if non-English (Claude Haiku)       │
│                │                                                │
│                └─ Write to SQLite                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
               agent/data/echo-trace.db (SQLite)
                    ├── comparisons          (analysis results)
                    └── echo_embeddings      (precomputed Voyage vectors)
                              │
                    ┌──────────────────────────┐
                    │  Next.js Frontend        │
                    │  /[locale]/              │
                    │  /[locale]/comparisons   │
                    │  /[locale]/comparisons/  │
                    │             [id]         │
                    │  /[locale]/dashboard     │
                    │  /[locale]/console       │
                    └──────────────────────────┘
```

### Scripts

| Script | Purpose |
|---|---|
| `scripts/cycle.sh` | Bash orchestrator — runs every 6 hours via crontab |
| `scripts/scrape-news.mjs` | Scrapes 30+ sources; emits new article URLs to stdout |
| `scripts/analyze-one-url.mjs` | Full analysis pipeline for a single URL; writes result to SQLite |
| `scripts/precompute-embeddings.mjs` | One-time seeder — computes Voyage AI embeddings for all 88 historical echoes and stores them in `echo_embeddings`; re-run after adding new echoes |
| `scripts/analyze-new.mjs` | Utility — batch-processes unanalysed URLs |
| `scripts/db.mjs` | SQLite helpers shared by analysis and seeder scripts |

---

## Analytical Dimensions

Each comparison is annotated across 18 scientific dimensions. Dimensions marked **[v2]** were added in version 2.0 to support regime-agnostic classification beyond the original Russia–Ukraine scope.

### Structural propaganda frameworks

| Dimension | Values | Source |
|---|---|---|
| **narrative_strategy** | `suppression` · `destruction` · `direction` · `exploitation` | Lank & Antai — *Strategic Narrative Typology*, International Journal of Communication, 2025 · [doi.org/10.1177/19401612251317696](https://doi.org/10.1177/19401612251317696) |
| **ellul_type** | `agitation` (mobilise for action) · `integration` (normalise existing order) | Jacques Ellul — *Propaganda: The Formation of Men's Attitudes* (1965) · [Wikipedia](https://en.wikipedia.org/wiki/Propaganda_(Ellul_book)) |
| **ellul_axis** | `vertical` (top-down state messaging) · `horizontal` (peer-group diffusion) | Jacques Ellul — *Propaganda* (1965) |
| **nimmo_4d** | `Dismiss` · `Distort` · `Distract` · `Dismay` | Ben Nimmo — DFRLab / EUvsDisinfo · [euvsdisinfo.eu/the-4d-approach](https://euvsdisinfo.eu/the-4d-approach/) |

### Technique taxonomies

| Dimension | Values | Source |
|---|---|---|
| **san\_martino\_techniques** | 18 techniques: Appeal to Authority · Appeal to Fear/Prejudice · Bandwagon · Black-and-White Fallacy · Causal Oversimplification · Doubt · Exaggeration/Minimisation · Flag-Waving · Loaded Language · Name Calling/Labeling · Obfuscation/Vagueness · Red Herring · Repetition · Slogans · Straw Man · Thought-terminating Clichés · Transfer · Whataboutism | Da San Martino et al. — *Fine-Grained Analysis of Propaganda in News Articles*, ACL 2019 · [aclanthology.org/W19-2006](https://aclanthology.org/W19-2006/) |
| **ipa\_techniques** | 7 techniques: Name-calling · Glittering generalities · Transfer · Testimonial · Plain folks · Card stacking · Bandwagon | Institute for Propaganda Analysis — *7 Techniques* (1937) · [Wikipedia](https://en.wikipedia.org/wiki/Institute_for_Propaganda_Analysis) |
| **eco\_properties** | 14 features of Ur-Fascism: Cult of Tradition · Rejection of Modernism · Action for Action's Sake · Disagreement is Treason · Fear of Difference · Frustrated Middle Class · Obsession with a Plot · Enemies Too Strong and Too Weak · Pacifism as Collaboration · Contempt for the Weak · Selective Populism · Newspeak · Education Toward Heroism · Machismo and Weaponry | Umberto Eco — *Ur-Fascism*, New York Review of Books (1995) · [Wikipedia](https://en.wikipedia.org/wiki/Ur-Fascism) |

### EUvsDisinfo dimensions

| Dimension | Values | Source |
|---|---|---|
| **eudisinfo\_narratives** | `Nazis` · `Lost Sovereignty` · `Threatened Values` · `Elites vs People` · `Imminent Collapse` · `Russia as Victim` | EUvsDisinfo — [Disinformation Cases Database](https://euvsdisinfo.eu/disinformation-cases/) |
| **eudisinfo\_rhetoric** | SWAMPED: `Straw Man` · `Whataboutism` · `Attack` · `Mockery` · `Provocations` · `Exhaust` · `Denial` | EUvsDisinfo — [Modus Trollerandi](https://euvsdisinfo.eu/modus-trollerandi-the-kremlin-rhetoric/) |
| **eudisinfo\_conspiracy** | `Shadow Government/Deep State` · `Anglo-Saxon Plot` · `Color Revolution Conspiracy` · `Soros Conspiracy` · `Gay/LGBTQ Lobby` · `Big Pharma/Vaccine Conspiracy` · `Rothschilds/Banker Conspiracy` · `False Flag` | EUvsDisinfo — [Disinformation Cases Database](https://euvsdisinfo.eu/disinformation-cases/) |
| **eudisinfo\_ttp** | Fabricated Content · Manipulated Content · False Attribution · False Context · Conspiracy Amplification · Narrative Laundering · Strategic Decontextualization · Emotional Manipulation · Infoshum · Firehose of Falsehood · Data Void Exploitation · Forced Confessions · Impersonation · Fake Experts · Video/Image Manipulation | DISARM Framework — [disarmframework.com](https://www.disarmframework.com/) |

### Political myth and narrative structure **[v2]**

| Dimension | Values | Notes | Source |
|---|---|---|---|
| **myth\_function** | `cosmogonic` · `eschatological` · `theodicy` · `heroic` · `providential` | founding myth · final battle · suffering is meaningful · leader as saviour · historical mission | Flood — *Political Myth* (Routledge, 2002); Tudor — *Political Myth* (Macmillan, 1972) |
| **enemy\_type** | `external` · `internal` · `ontological` · `shadow` | foreign actor · traitor/fifth column · constitutionally inferior · occult/conspiratorial hidden enemy | Volkan — *The Need to Have Enemies and Allies* (1988); Keen — *Faces of the Enemy* (1986) |
| **legitimation\_mode** | `authorization` · `moral` · `rationalization` · `mythopoesis` | appeal to authority · appeal to values · instrumental justification · narrative/historical justification | van Leeuwen — *Discourse and Practice* (Oxford UP, 2008) · [doi](https://academic.oup.com/book/26629) |
| **frame\_function** | `diagnostic` · `prognostic` · `motivational` | defines problem & blame · proposes solution · emotional mobilisation | Snow & Benford (1988); Entman — *Framing*, J. of Communication 43(4) (1993) · [doi](https://doi.org/10.1111/j.1460-2466.1993.tb01304.x) |
| **dehumanisation\_level** | 1–10 | 1=Classification · 2=Symbolisation · 3=Discrimination · 4=Dehumanisation · 5=Organisation · 6=Polarisation · 7=Preparation · 8=Persecution · 9=Extermination · 10=Denial | Stanton — *Ten Stages of Genocide* (Genocide Watch, 1996/2013) · [genocide.watch](https://www.genocide.watch/ten-stages-of-genocide) |
| **temporality** | `retrospective` · `contemporaneous` · `prospective` | golden age / historical grievance · present crisis · victory narrative / promised future | Flood — *Political Myth* (2002); Mink — *History and Fiction as Modes of Comprehension*, New Literary History 1(3) (1970) |
| **greimas\_actantial** | subject · object · sender · receiver · helper · opponent | hero · goal · mandate-giver · beneficiary · ally · villain | Greimas — *Sémantique structurale* (1966); Propp — *Morphology of the Folktale* (1928) · [Wikipedia](https://en.wikipedia.org/wiki/Actantial_model) |

---

## Trope Taxonomy

The taxonomy in `archival-memory.json` covers 22 rhetorical tropes. Each entry contains modern keywords for detection, 88 historical echoes in total with verbatim quotes and verifiable source citations, and full annotation across all 18 dimensions above.

### Kremlin-aligned tropes (v1.0 — 14 tropes)

| ID | Theme |
|---|---|
| `foreign_saboteur` | External Threat / Foreign Interference |
| `paternal_protector` | The Cult of the Infallible Leader |
| `moral_purification` | Traditional Values vs. Modern Degeneracy |
| `nazi_label` | Labelling the Enemy as Nazi / Fascist |
| `territorial_myth` | Territorial Revisionism and the 'One People' Claim |
| `maidan_coup` | Delegitimising Democratic Uprisings as Foreign-Backed Coups |
| `covert_operations` | Secret Western Bioweapons, Labs, and Hidden Aggression |
| `atrocity_denial` | Denying or Fabricating Evidence of War Crimes |
| `color_revolution` | Civic Protests Reframed as CIA-Engineered Colour Revolutions |
| `puppet_regime` | Denying Sovereignty: The Target State as Western Puppet |
| `imminent_defeat` | Ukraine / The West is Losing and Will Collapse |
| `nato_aggressor` | NATO Expansion as Existential Provocation |
| `russia_peacemaker` | Russia as the Rational Peace-Seeker Forced into War |
| `genocide_reversal` | Accusing the Victim of Genocide to Justify Intervention |

### Regime-agnostic tropes (v2.0 — 8 tropes)

These tropes recur across authoritarian regimes regardless of geopolitical alignment — covering Myanmar, Eritrea, Syria, Cuba, Turkmenistan, Iran, Venezuela and others.

| ID | Theme | Typical regimes |
|---|---|---|
| `leader_infallibility` | The Infallible Ruler Cannot Err — Failure Belongs to Traitors | Eritrea, Turkmenistan, North Korea, Cuba, Myanmar |
| `anti_imperial_reversal` | Western Criticism as Neo-Colonialism / Imperialist Interference | Cuba, Venezuela, Zimbabwe, Eritrea, Iran, Syria |
| `civilisational_mission` | Our Regime Carries a World-Historical Civilisational Mission | Russia, China, Iran |
| `stability_mandate` | Strong Rule Is Necessary to Prevent Chaos and Civil War | Syria, Myanmar, Egypt, Zimbabwe |
| `economic_siege` | Western Sanctions and Blockades Are Acts of War Against Civilians | Cuba, Venezuela, Iran, Syria, Russia, North Korea |
| `media_lie` | All Independent and Western Media Is Fabricated Propaganda | All — universal authoritarian trope |
| `unity_demand` | Internal Dissent in a Time of National Crisis Is Treason | All — universal during wars and crises |
| `ethnic_protection` | The Regime Must Protect an Ethnic or Religious Group from Persecution | Russia/Donbas, Serbia/Bosnia, Turkey/Cyprus |

---

## Monitored Sources

The scraper monitors 30+ outlets across seven regime clusters. Sources marked `[RSS]` use RSS feeds; others use HTML scraping with a Puppeteer fallback for JS-rendered pages.

| Regime | Outlets |
|---|---|
| **Russia** | TASS `[RSS]` · en.kremlin.ru · government.ru |
| **China** | Xinhua `[RSS]` · China Daily `[RSS]` · People's Daily `[RSS]` · Global Times `[RSS]` |
| **Belarus** | BelTA `[RSS]` · ONT |
| **Cuba** | Granma `[RSS]` · Prensa Latina `[RSS]` · Cubadebate `[RSS]` |
| **Iran** | Press TV `[RSS]` · Tehran Times `[RSS]` |
| **North Korea** | KCNA (HTML scraping, HTTP-only — HTTPS not served by kcna.kp) |
| **Venezuela** | AVN / MPPRE |
| **Zimbabwe** | The Herald `[RSS]` |
| **Syria** | SANA `[RSS]` |
| **Eritrea** | Shabait (Ministry of Information) |
| **Turkmenistan** | TDH (State News Agency) |
| **Tajikistan** | Khovar `[RSS]` |
| **Yemen (Houthi)** | SABA News Agency |
| **Western Sahara / SADR** | SPS-RASD |
| **Myanmar** | Global New Light of Myanmar `[RSS]` |
| **Eswatini** | Eswatini Observer `[RSS]` · Times of Eswatini |

> **Note:** Some Russian sources are blocked under EU sanctions. Scraping requires a non-EU VPN or server.
> **Note:** Use of a VPN or other anonymisation method is strongly advised to avoid exposing the scraping origin to authoritarian regime infrastructure.

---

## Setup

### Prerequisites

- Node.js 18+
- An Anthropic API key (Claude Haiku for classification and translation; Claude Sonnet for deep analysis)
- A Voyage AI API key (for semantic echo search; free tier covers 200M tokens — sufficient for years of normal usage)
- Chromium (for Puppeteer — auto-downloaded on `npm install`)

### Install

```bash
git clone <repo-url>
cd echo-trace

# Root dependencies (scraping + analysis scripts)
npm install

# Web frontend dependencies
cd web && npm install && cd ..
```

### Environment

Copy the included template and fill in your keys:

```bash
cp .env.example .env
```

`.env` contents:

```
ANTHROPIC_API_KEY=sk-ant-...
VOYAGE_API_KEY=pa-...
```

`.env` is gitignored and never committed. `cycle.sh` sources it automatically on startup, so no shell exports or profile changes are needed. For cron on a headless server, the same `.env` file is picked up — no additional configuration required.

### Seed the embedding index

After installation (and again after adding new echoes to `archival-memory.json`):

```bash
node scripts/precompute-embeddings.mjs
```

This embeds all 88 historical echoes via Voyage AI and stores the vectors in SQLite. It is idempotent — safe to re-run.

---

## Running

### Full autonomous cycle (scrape + analyse)

```bash
bash scripts/cycle.sh
```

Runs scraping then analysis of all new URLs. Logs to `agent/data/cycle.log`.

### Analyse a single URL

```bash
node scripts/analyze-one-url.mjs "https://tass.com/politics/..."
```

### Analyse all unprocessed URLs

```bash
node scripts/analyze-new.mjs
```

### Automated scheduling (crontab)

```bash
crontab -e
# Add (runs every 6 hours):
0 */6 * * * cd /path/to/echo-trace && bash scripts/cycle.sh >> /var/log/echo-trace.log 2>&1
```

---

## Web Frontend

A Next.js 15 app in `web/`. Reads comparisons directly from `agent/data/echo-trace.db` via `better-sqlite3`. The dashboard, comparisons list, and comparison detail pages use ISR (`revalidate = 21600`) so rendered HTML is cached for 6 hours — matching the pipeline cadence — and rebuilt in the background after the cache expires. The console page is fully dynamic. Supports 9 UI locales via `next-intl` with URL-based routing (`/[locale]/...`); the default locale (`en`) is served at `/`.

```bash
cd web
npm run dev     # http://localhost:3000
npm run build   # production build
npm run start   # production server
```

### Routes

| Route | Purpose |
|---|---|
| `/[locale]/` | Landing / About page |
| `/[locale]/comparisons` | Gallery of all comparisons (paginated feed) |
| `/[locale]/comparisons/[id]` | Detail view — modern quote, historical echo with source citation, divergence note, full 18-dimension analysis |
| `/[locale]/dashboard` | Analytics — stat cards, bar charts, source activity |
| `/[locale]/console` | Live Console — streaming log + world map |
| `/api/logs` | SSE endpoint — event-driven push from `cycle.log` via `fs.watch` |
| `/api/map-status` | JSON endpoint — active/processed countries for world map |

### Dashboard sections

- **Stat cards**: total comparisons, average confidence, tropes detected, articles scraped
- **Historical Trope Distribution**: ranked bar chart of all matched tropes
- **Analytical Framing**: Narrative Strategy (Lank & Antai) and Nimmo 4D
- **Ellul — Propaganda (1965)**: type (agitation/integration) and axis (vertical/horizontal)
- **Technique Taxonomies**: Da San Martino 18 techniques, IPA 7 techniques, Eco Ur-Fascism 14 features
- **EUvsDisinfo Dimensions**: Pro-Kremlin Narratives, Rhetoric (SWAMPED), Conspiracy Patterns, TTP Framework
- **Source Activity**: article counts and last-seen dates per outlet

### Live Console

- Real-time log stream from `cycle.log` via SSE; event-driven via `fs.watch` — no polling
- Interactive world map (`react-simple-maps`) highlighting countries as they are scraped
- Link to Freedom House — Freedom in the World 2026 for country freedom profiles

### Internationalisation

The UI is available in 9 locales: **English** (en), **French** (fr), **German** (de), **Russian** (ru), **Chinese** (zh), **Italian** (it), **Spanish** (es), **Portuguese** (pt), **Zulu** (zu). A language switcher in the navigation bar changes the locale in-place. All comparisons and scraped-article translations remain in UK English regardless of the selected UI locale.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Analysis scripts | Node.js 18+ (ESM), Bash |
| AI / LLM | Anthropic Claude (`claude-haiku-4-5-20251001` for classification and translation, `claude-sonnet-4-6` for deep analysis) via `@anthropic-ai/sdk` |
| Semantic embeddings | Voyage AI `voyage-3-lite` — cross-trope echo retrieval via cosine similarity |
| HTML parsing | Cheerio 1.2, Mozilla Readability 0.6, jsdom 29 |
| Browser automation | Puppeteer 24 (fallback for JS-rendered pages) |
| Web framework | Next.js 15, React 19 |
| Internationalisation | next-intl 3.x — 9 locales, URL-based routing |
| Styling | Tailwind CSS 4.2 |
| Animations | Framer Motion |
| World map | react-simple-maps 3.x + world-atlas (Natural Earth topojson) |
| Database | SQLite (`better-sqlite3`) — `agent/data/echo-trace.db` |
| Scheduling | cron |

---

## Data Formats

### `agent/data/echo-trace.db` (SQLite)

#### `comparisons` table

All analysis results. JSON columns (`tropes`, `analysis`, `historical_echo`) hold serialised objects.

```sql
CREATE TABLE comparisons (
  id                    TEXT PRIMARY KEY,
  timestamp             TEXT NOT NULL,       -- ISO 8601
  source_publication    TEXT,                -- outlet hostname, e.g. "tass.com"
  source_url            TEXT,
  contemporary_quote    TEXT,                -- extracted quote, original language
  contemporary_quote_en TEXT,                -- UK English translation (if non-English)
  translation_language  TEXT,
  translation_service   TEXT,
  historical_parallel   TEXT,                -- matched trope theme
  tropes                TEXT,                -- JSON array, e.g. ["foreign_saboteur"]
  confidence            REAL,                -- 0.0 – 0.95
  analysis              TEXT,                -- JSON object — all 18 analytical dimensions
  historical_echo       TEXT,                -- JSON: { figure, year, quote, context, source? }
  divergence_note       TEXT,
  extraction_method     TEXT,                -- readability | jsonld | dom_paragraphs | puppeteer_dom | fallback_text
  evidence_snippet      TEXT,
  notes                 TEXT
);
```

The `historical_echo` JSON object:
```json
{
  "figure": "Joseph Goebbels",
  "year": "1933",
  "quote": "...",
  "context": "...",
  "source": {
    "citation": "Calvin University German Propaganda Archive — Goebbels speech, 28 February 1933",
    "url": "https://research.calvin.edu/german-propaganda-archive/..."
  }
}
```

**Indexes:** `idx_ts` on `timestamp DESC` (list ordering), `idx_url` on `source_url` (deduplication).

#### `echo_embeddings` table

Precomputed Voyage AI vectors for all historical echoes. Used at analysis time for cross-trope cosine similarity retrieval.

```sql
CREATE TABLE echo_embeddings (
  echo_key   TEXT PRIMARY KEY,   -- {trope_id}:{slugified-figure}:{sha1(quote)[0:8]}
  trope_id   TEXT NOT NULL,
  figure     TEXT NOT NULL,
  quote      TEXT NOT NULL,
  context    TEXT,
  source     TEXT,               -- JSON: { citation, url? }
  embedding  BLOB NOT NULL       -- Float32Array stored as raw bytes
);
```

Populated by `scripts/precompute-embeddings.mjs`. Re-run the seeder after adding new echoes to `archival-memory.json`.

### `archival-memory.json`

The core analytical reference. Contains:
- `_comment` — human-readable dimension reference chart
- `_meta` — machine-readable dimension definitions with sources and valid values
- `rhetorical_tropes` — 22 trope entries, each with: `taxonomy` (all 18 dimension defaults), `modern_keywords` (detection strings), `historical_echoes` (verbatim quotes with figure, context, source citation and URL), `modern_examples` (regime source URLs)

---

## License

GPL v3

See LICENSE file for more.
