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
2. Pass modern quote + trope's historical_echoes to Claude.
3. Claude selects the most resonant historical echo and writes a divergence note.
4. Returns structured output merged into the comparisons.json entry.

## Output Fields Added to Entry
- `historical_echo.figure` — name of the historical figure
- `historical_echo.year` — approximate year
- `historical_echo.quote` — the parallel historical quote
- `historical_echo.context` — brief regime context
- `divergence_note` — how the 2026 language differs from the historical version

## Threshold Rule (from SOUL.md)
- confidence >= 0.4 → run historical analysis
- confidence < 0.4 → do not force comparison; trigger archive-expansion skill
