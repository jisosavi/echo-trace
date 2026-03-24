# HEARTBEAT: 6-Hour Autonomous Schedule

## Cadence
OpenClaw runs in a repeating 6-hour cycle.

# Interval: 6 Hours
- **Phase 1:** Run `news-archaeology` skill to scan TASS, Xinhua, and SPA.
- **Phase 2:** If new data is found, run `historical-analyst` logic to find matches in `archival-memory.json`.
- **Phase 3:** Trigger `archive-expansion` if no match is found (research new tropes).
- **Phase 4:** Run `web-sync` to update the gallery at isosavi.com.

## Failure Policy
- Retry transient network failures with exponential backoff.
- If a source is unreachable for 3 cycles, flag degraded mode.
- Never overwrite archival data without timestamped backup.
