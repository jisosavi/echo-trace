# ECHO/trace

**Authoritarian propaganda does not invent new language. It inherits it.**

ECHO/trace is an autonomous AI-powered pattern-matching system that exposes this inheritance in real time. Every six hours, it scrapes 30+ state media outlets across authoritarian regimes, identifies rhetorical patterns using a 22-trope taxonomy, and matches them against a historical archive of 20th-century dictatorships.

The output: forensic pairings that juxtapose today's propaganda with its structural ancestors — a Putin spokesman echoing Goebbels, Chinese state media recycling Stalin, Iranian broadcasts mirroring Mussolini.

## How it works

The system operates as a digital archaeologist, analyzing each article across 18 scientific dimensions drawn from propaganda studies, semiotics, and genocide prevention research. It searches for structural DNA matches in archives from Nazi Germany, Stalinist USSR, Maoist China, and Fascist Italy — the most thoroughly documented propaganda corpora in history.

The analysis is clinical; the conclusions are implicit in the parallelism.

Just parallel quotes, timestamped and traced.

**Making inheritance visible is the point.**

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
2. **Classifies** each article against a 22-trope rhetorical taxonomy using Claude (claude-haiku-4-5-20251001 for classification, claude-sonnet-4-6 for deep analysis)
3. **Searches** an archive of 100+ historical quotes from Stalin, Goebbels, Mussolini, Mao, Milošević and others for structural parallels
4. **Annotates** each match across 18 analytical dimensions drawn from propaganda studies, semiotics, political myth theory, and genocide prevention research
5. **Translates** non-English quotes to UK English (auto-detected; original preserved)
6. **Publishes** results to a Next.js gallery at `/comparisons` — each entry showing the modern quote, historical echo, and full multi-dimensional analysis
7. **Streams** live execution logs to the Live Console at `/console`, with a real-time world map showing which countries are being scraped

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Crontab (every 6 hours)                                    │
│    └─ scripts/cycle.sh                                      │
│         │                                                   │
│         ├─ Phase 1: scrape-news.mjs                         │
│         │    Fetches 30+ sources → agent/data/raw-news.json │
│         │                                                   │
│         └─ Phase 2: loop over new URLs                      │
│              analyze-one-url.mjs <URL>                      │
│                │                                            │
│                ├─ Extract article text                      │
│                │    (Readability → JSON-LD → DOM → fallback)│
│                │                                            │
│                ├─ Classify trope (Claude Haiku)             │
│                │    → archival-memory.json taxonomy         │
│                │                                            │
│                ├─ Find historical echo (Claude Opus)        │
│                │    → 100+ archived quotes                  │
│                │                                            │
│                ├─ Multi-dimensional analysis (Claude Opus)  │
│                │    → 18 analytical dimensions              │
│                │                                            │
│                ├─ Translate if non-English (Claude Haiku)   │
│                │                                            │
│                └─ Write to SQLite DB                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
               agent/data/echo-trace.db (SQLite)
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
| `scripts/scrape-news.mjs` | Scrapes 30+ sources; outputs to `raw-news.json` |
| `scripts/analyze-one-url.mjs` | Deep-analyses a single URL; writes result to `agent/data/echo-trace.db` |
| `scripts/analyze-new.mjs` | Batch-processes all unanalysed URLs from `raw-news.json` |
| `scripts/batch-classify.mjs` | Classifies EUvsDisinfo training data with prompt caching |
| `scripts/fetch-eudisinfo.mjs` | Fetches disinformation cases from euvsdisinfo.eu API |

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
| **greimas\_actantial** | subject · object · sender · receiver · helper · opponent | hero · goal · mandate-giver · beneficiary · ally · villain — documented for future per-article computation | Greimas — *Sémantique structurale* (1966); Propp — *Morphology of the Folktale* (1928) · [Wikipedia](https://en.wikipedia.org/wiki/Actantial_model) |

---

## Trope Taxonomy

The taxonomy in `archival-memory.json` covers 22 rhetorical tropes. Each entry contains modern keywords for detection, historical echoes with verbatim quotes, modern examples with Kremlin/regime source URLs, and full annotation across all 18 dimensions above.

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
> **Note:** Use of VPN or other anonymisation method is highly advised to hide the scraping from authoritarian regimes.

---

## Setup

### Prerequisites

- Node.js 18+
- An Anthropic API key (`claude-opus-4-6` for classification and historical analysis; `claude-haiku-4-5-20251001` for translation)
- Chromium (for Puppeteer — auto-downloaded on `npm install`)

### Install

```bash
git clone <repo-url>
cd forensic-semiotics

# Root dependencies (scraping + analysis scripts)
npm install

# Web frontend dependencies
cd web && npm install && cd ..
```

### Environment

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

For persistent use on a server or Raspberry Pi, add to `/etc/environment` or `~/.profile` so cron can access it.

No `.env` file is required. The API key is the only required variable.

---

## Running

### Full autonomous cycle (scrape + analyse)

```bash
bash scripts/cycle.sh
```

Runs Phase 1 (scraping) then Phase 2 (analysis of new URLs). Logs to `agent/data/cycle.log`.

### Scraping only

```bash
node scripts/scrape-news.mjs

# Filter by regime or source:
node scripts/scrape-news.mjs --regime Russia
node scripts/scrape-news.mjs --source TASS --limit 5
```

### Analyse a single URL

```bash
node scripts/analyze-one-url.mjs "https://tass.com/politics/..."
```

### Analyse all unprocessed URLs

```bash
node scripts/analyze-new.mjs
node scripts/analyze-new.mjs --limit 20 --delay 3000
```

### Automated scheduling (crontab)

```bash
crontab -e
# Add (runs every 6 hours):
0 */6 * * * cd /path/to/forensic-semiotics && bash scripts/cycle.sh >> /var/log/forensic-semiotics.log 2>&1
```

### EUvsDisinfo training data (optional)

```bash
# Fetch cases from euvsdisinfo.eu:
node scripts/fetch-eudisinfo.mjs --keyword "ukraine"

# Batch-classify with Claude:
node scripts/batch-classify.mjs
```

---

## Web Frontend

A Next.js 15 app in `web/`. Reads comparisons from `agent/data/echo-trace.db` via `better-sqlite3`. The dashboard, comparisons list, and comparison detail pages use ISR (`revalidate = 21600`) so rendered HTML is cached for 6 hours — matching the pipeline cadence — and rebuilt in the background after the cache expires. The console page remains fully dynamic. Supports 9 UI locales via `next-intl` with URL-based routing (`/[locale]/...`); the default locale (`en`) is served at `/`.

```bash
cd web
npm run dev     # http://localhost:3000
npm run build   # production build
npm run start   # production server
```

### Routes

All content routes are locale-prefixed. The default locale (`en`) redirects from `/` automatically.

| Route | Purpose |
|---|---|
| `/[locale]/` | Landing / About page |
| `/[locale]/comparisons` | Gallery of all comparisons (paginated feed) |
| `/[locale]/comparisons/[id]` | Detail view — full multi-dimensional analysis |
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

- Real-time log stream from `cycle.log` via SSE; event-driven via `fs.watch` (pushes only on file writes, no polling)
- Interactive world map (`react-simple-maps`) highlighting countries as they are scraped
- Link to Freedom House — Freedom in the World 2026 for country freedom profiles

### Internationalisation

The UI is available in 9 locales: **English** (en), **French** (fr), **German** (de), **Russian** (ru), **Chinese** (zh), **Italian** (it), **Spanish** (es), **Portuguese** (pt), **Zulu** (zu). A language switcher in the navigation bar changes the locale in-place. All comparisons and scraped-article translations remain in UK English regardless of the selected UI locale.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Analysis scripts | Node.js 18+ (ESM), Bash |
| AI / LLM | Anthropic Claude (`claude-haiku-4-5-20251001`, `claude-sonnet-4-6`) via `@anthropic-ai/sdk` |
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

### `agent/data/raw-news.json`
```json
[
  {
    "source": "TASS",
    "regime": "Russia",
    "language": "en",
    "title": "...",
    "url": "https://...",
    "retrieved_at": "2026-04-18T10:00:00Z"
  }
]
```

### `agent/data/echo-trace.db` (SQLite)

All comparison results are stored in a single `comparisons` table. JSON columns (`tropes`, `analysis`, `historical_echo`) hold serialised objects.

```sql
CREATE TABLE comparisons (
  id                    TEXT PRIMARY KEY,
  timestamp             TEXT NOT NULL,       -- ISO 8601
  source_publication    TEXT,                -- hostname, e.g. "tass.com"
  source_url            TEXT,
  contemporary_quote    TEXT,                -- extracted quote, original language
  contemporary_quote_en TEXT,                -- UK English translation (if non-English)
  translation_language  TEXT,
  translation_service   TEXT,
  historical_parallel   TEXT,                -- matched trope theme
  tropes                TEXT,                -- JSON array, e.g. ["foreign_saboteur"]
  confidence            REAL,                -- 0.0 – 0.95
  analysis              TEXT,                -- JSON object with all 18 dimensions
  historical_echo       TEXT,                -- JSON: { figure, year, quote, context }
  divergence_note       TEXT,
  extraction_method     TEXT,                -- readability | jsonld | dom_paragraphs | puppeteer_dom | fallback_text
  evidence_snippet      TEXT,
  notes                 TEXT
);
```

**Indexes:** `idx_ts` on `timestamp DESC` (list ordering), `idx_url` on `source_url` (deduplication).

### `archival-memory.json`

The core analytical reference. Contains:
- `_comment` — human-readable dimension reference chart (this file's equivalent of comments)
- `_meta` — machine-readable dimension definitions with sources and valid values
- `rhetorical_tropes` — 22 trope entries, each with: `taxonomy` (all 18 dimension defaults), `modern_keywords` (detection strings), `historical_echoes` (2–5 verbatim quotes with source attribution), `modern_examples` (Kremlin/regime source URLs)

---

## License

GPL v3

See LICENSE file for more.

