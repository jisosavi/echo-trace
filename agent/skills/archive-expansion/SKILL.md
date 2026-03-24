---
name: archive-expansion
description: Research and propose new propaganda tropes and historical quote mappings, then append vetted entries to archival-memory.json. Use when trope coverage is insufficient or repeated unknown patterns appear.
---

# Archive Expansion

## Purpose
Continuously improve historical comparison quality by extending trope inventory.

## Workflow
1. Review unmatched or low-confidence contemporary quotes.
2. Research candidate historical parallels from credible references.
3. Draft new trope entries with keywords and citations.
4. Validate JSON integrity and append to `archival-memory.json`.

## Entry Requirements
- Stable `id` in kebab-case.
- Clear trope description.
- At least one historical example with `figure`, `quote`, and `note`.
- A keyword list for retrieval.

## Validation
Run JSON validation before commit:
```bash
python3 -m json.tool archival-memory.json >/dev/null
```
