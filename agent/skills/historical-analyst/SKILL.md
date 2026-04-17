---
name: historical-analyst
description: Given a classified trope and modern quote, select the best historical echo from archival-memory.json and generate a semantic divergence note. Produces the full three-way analogy required by SOUL.md. Only runs when confidence >= 0.4; low-confidence entries trigger archive-expansion instead.
---

# Historical Analyst

## Purpose
Bridge the modern signal to its historical twin — completing the core forensic act of the project.

## Inputs
- Classified trope (id, theme, historical_echoes from archival-memory.json)
- Modern quote extracted from the article
- Article text (for context)
- Source URL and publication

## Workflow
1. If trope confidence < 0.4 → skip and flag for archive-expansion.
2. Pass article text to Claude with the full multi-dimensional taxonomy (see below).
3. Claude classifies across all eight analytical dimensions simultaneously.
4. Claude selects the most resonant historical echo and writes a divergence note.
5. Returns structured output merged into the comparisons.json entry.

## Output Fields Added to Entry

### `analysis` object (multi-dimensional classification)

- `analysis.theme` — rhetorical theme matching the trope
- `analysis.narrative_strategy` — one of: `suppression`, `destruction`, `direction`, `exploitation`
  *(Lank & Antai 2025 — Russian information warfare narrative strategies)*
- `analysis.san_martino_techniques` — array, all applicable from the 18-technique taxonomy:
  Appeal to Authority, Appeal to Fear/Prejudice, Bandwagon, Black-and-White Fallacy,
  Causal Oversimplification, Doubt, Exaggeration/Minimisation, Flag-Waving, Loaded Language,
  Name Calling/Labeling, Obfuscation/Vagueness, Red Herring, Repetition, Slogans,
  Straw Man, Thought-terminating Clichés, Whataboutism, Smears
  *(Da San Martino et al., ACL 2019)*
- `analysis.ipa_techniques` — array, all applicable from the 7 IPA techniques:
  Name-calling, Glittering generalities, Transfer, Testimonial, Plain folks, Card stacking, Bandwagon
  *(Institute for Propaganda Analysis, 1937)*
- `analysis.nimmo_4d` — one of: `Dismiss`, `Distort`, `Distract`, `Dismay`
  *(DFRLab / Ben Nimmo — 4Ds model)*
- `analysis.ellul_type` — `agitation` (short-term mobilization) or `integration` (worldview normalization)
  *(Jacques Ellul, Propaganda: The Formation of Men's Attitudes, 1965)*
- `analysis.ellul_axis` — `vertical` (state broadcast) or `horizontal` (peer-to-peer)
  *(Jacques Ellul, 1965)*
- `analysis.eco_properties` — array, all applicable from Eco's 14 Ur-Fascism features:
  The Cult of Tradition, The Rejection of Modernism, The Cult of Action for Action's Sake,
  Disagreement is Treason, Fear of Difference, Appeal to a Frustrated Middle Class,
  Obsession with a Plot, Enemies Too Strong and Too Weak, Pacifism as Enemy Collaboration,
  Contempt for the Weak, Education Toward Heroism, Machismo, Selective Populism, Newspeak
  *(Umberto Eco, "Ur-Fascism", 1995)*
- `analysis.eudisinfo_narratives` — array, all applicable from 6 key pro-Kremlin narratives:
  Elites vs People, Threatened Values, Lost Sovereignty, Imminent Collapse, Hahaganda, Nazis
  *(EUvsDisinfo, euvsdisinfo.eu/learn)*
- `analysis.eudisinfo_rhetoric` — array, all applicable from SWAMPED (7 rhetorical devices):
  Straw Man, Whataboutism, Attack, Mockery, Provocations, Exhaust, Denial
  *(EUvsDisinfo Modus Trollerandi, euvsdisinfo.eu/learn)*
- `analysis.eudisinfo_conspiracy` — array of applicable conspiracy theory patterns (EUvsDisinfo Shadow Government archetype):
  Shadow Government / Deep State, Rothschilds / Banker Conspiracy, Protocols / Jewish Plot,
  Soros Conspiracy, Anglo-Saxon Plot, Color Revolution Conspiracy,
  Climate Hoax, Big Pharma / Vaccine Conspiracy, Gay / LGBTQ Lobby, False Flag
  *(EUvsDisinfo, "Why Authoritarians Love the Concept of the Big Conspiracy", 2019)*
- `analysis.eudisinfo_ttp` — array of applicable content-detectable TTPs (DISARM Framework / EUvsDisinfo):
  Fabricated Content, Manipulated Content, False Attribution, False Context,
  Fake Experts, Forced Confessions, Video/Image Manipulation, Infoshum,
  Firehose of Falsehood, Conspiracy Amplification, Narrative Laundering,
  Data Void Exploitation, Strategic Decontextualization, Impersonation, Emotional Manipulation
  *(DISARM Framework, disarmframework.net — content-detectable subset only)*

### Historical echo fields
- `historical_echo.figure` — name of the historical figure
- `historical_echo.year` — approximate year
- `historical_echo.quote` — the parallel historical quote
- `historical_echo.context` — brief regime context
- `divergence_note` — how the 2026 language differs from the historical version

## Threshold Rule
- confidence >= 0.4 → run full multi-dimensional analysis + historical echo
- confidence < 0.4 → do not force comparison; trigger archive-expansion skill
