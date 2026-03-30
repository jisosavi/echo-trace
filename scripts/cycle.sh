#!/usr/bin/env bash
# cycle.sh — Autonomous scrape-and-analyse cycle, designed for crontab.
#
# Replaces openclaw-cycle.sh without any OpenClaw dependencies.
#
# Usage (manual):
#   bash scripts/cycle.sh
#
# Crontab (every 6 hours) — add with `crontab -e`:
#   0 */6 * * * cd /home/pi/forensic-semiotics && bash scripts/cycle.sh
#
# Required env var:
#   ANTHROPIC_API_KEY
#
# Optional — set in /etc/environment or ~/.profile on the Pi so cron can see it:
#   export ANTHROPIC_API_KEY="sk-ant-..."

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PATH="$ROOT_DIR/agent/data/openclaw.log"

mkdir -p "$(dirname "$LOG_PATH")"

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

if [[ -z "${NEW_URLS:-}" ]] || [[ "${URL_COUNT:-0}" -eq 0 ]]; then
  log "cycle=end reason=no-new-urls"
  exit 0
fi

# ── Phase 2: Analyse each new article ─────────────────────────────────────────

log "phase=analyze status=started"
FAILED=0

while IFS= read -r url; do
  [[ -z "$url" ]] && continue
  log "analyzing url=$url"
  if ! node "$ROOT_DIR/scripts/analyze-one-url.mjs" "$url" >>"$LOG_PATH" 2>&1; then
    log "analysis-failed url=$url"
    FAILED=$((FAILED + 1))
  fi
done <<< "$NEW_URLS"

log "phase=analyze status=complete failed=$FAILED"
log "cycle=end"
