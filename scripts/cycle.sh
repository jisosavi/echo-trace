#!/usr/bin/env bash
# cycle.sh — Autonomous scrape-and-analyse cycle, designed for crontab.
#
# Runs scraping and analysis without any external orchestration dependencies.
#
# Usage (manual):
#   bash scripts/cycle.sh
#
# Crontab (every 6 hours) — add with `crontab -e`:
#   0 */6 * * * cd /path/to/echo-trace && bash scripts/cycle.sh
#
# Required env vars (define in .env at the project root, or export to shell/cron):
#   ANTHROPIC_API_KEY
#   VOYAGE_API_KEY     (semantic echo search; required for baseline statistics)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PATH="$ROOT_DIR/agent/data/cycle.log"

mkdir -p "$(dirname "$LOG_PATH")"

# Load .env if present (allows running without exporting vars to the shell profile)
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -o allexport
  # shellcheck source=/dev/null
  source "$ROOT_DIR/.env"
  set +o allexport
fi

log() {
  local msg="[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [cycle] $1"
  echo "$msg" | tee -a "$LOG_PATH"
}

# ── Preflight ──────────────────────────────────────────────────────────────────

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  log "ERROR: ANTHROPIC_API_KEY is not set — aborting"
  exit 1
fi

log "cycle=start"

# ── Phase 1: Scrape front pages for new article URLs ──────────────────────────

log "phase=scrape status=started"
NEW_URLS=$(node "$ROOT_DIR/scripts/scrape-news.mjs" 2>>"$LOG_PATH") || true
URL_COUNT=$(printf '%s\n' "$NEW_URLS" | grep -c 'http' 2>/dev/null || true)
log "phase=scrape status=complete new_urls=${URL_COUNT:-0}"

# No early exit when nothing is new: failed articles from earlier cycles are retried.

# ── Phase 2: Analyse every pending article (new + retries) in one process ─────

log "phase=analyze status=started"
STATUS=0
node "$ROOT_DIR/scripts/analyze-new.mjs" >>"$LOG_PATH" 2>&1 || STATUS=$?
log "phase=analyze status=complete exit=$STATUS"
log "cycle=end"
