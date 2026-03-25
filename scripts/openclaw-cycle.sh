#!/usr/bin/env bash
# openclaw-cycle.sh — Full autonomous analysis cycle (HEARTBEAT phases 1-4).
#
# NOT activated automatically. To run manually:
#   bash scripts/openclaw-cycle.sh
#
# To activate on a schedule, add to cron:
#   0 */6 * * * cd /path/to/forensic-semiotics && bash scripts/openclaw-cycle.sh
#
# Required env vars:
#   OPENCLAW_ANALYZE_COMMAND  (or set below as default)
#   ANTHROPIC_API_KEY
# Optional:
#   OPENCLAW_COMPARE_COMMAND
#   OPENCLAW_EXPAND_COMMAND
#   OPENCLAW_VALIDATE_COMMAND
#   OPENCLAW_MANUAL_SYNC=1 + OPENCLAW_SYNC_MODE=git|ssh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PATH="$ROOT_DIR/agent/data/openclaw.log"

mkdir -p "$(dirname "$LOG_PATH")"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [openclaw-cycle] $1" >> "$LOG_PATH"
  echo "$1"
}

: "${OPENCLAW_ANALYZE_COMMAND:=node $ROOT_DIR/scripts/analyze-one-url.mjs \"__TARGET_URL__\"}"
export OPENCLAW_ANALYZE_COMMAND

log "cycle=start"

# ── Phase 1: Scrape new articles ──────────────────────────────────────────────
log "phase=news-archaeology status=started"
NEW_URLS=$(node "$ROOT_DIR/scripts/scrape-news.mjs" 2>>"$LOG_PATH") || true
URL_COUNT=$(echo "$NEW_URLS" | grep -c 'http' || true)
log "phase=news-archaeology status=complete new_urls=$URL_COUNT"

if [[ -z "$NEW_URLS" || "$URL_COUNT" -eq 0 ]]; then
  log "phase=historical-analyst status=skipped reason=no-new-urls"
  log "cycle=end"
  exit 0
fi

# ── Phase 2: Analyze each new article ────────────────────────────────────────
log "phase=historical-analyst status=started"
FAILED=0
while IFS= read -r url; do
  [[ -z "$url" ]] && continue
  log "analyzing url=$url"
  if ! bash "$ROOT_DIR/scripts/manual-task.sh" "$url" >> "$LOG_PATH" 2>&1; then
    log "analysis-failed url=$url"
    FAILED=$((FAILED + 1))
  fi
done <<< "$NEW_URLS"
log "phase=historical-analyst status=complete failed=$FAILED"

# ── Phase 3: Validate output ──────────────────────────────────────────────────
if [[ -n "${OPENCLAW_VALIDATE_COMMAND:-}" ]]; then
  log "phase=validate status=started"
  if bash -lc "$OPENCLAW_VALIDATE_COMMAND"; then
    log "phase=validate status=ok"
  else
    log "phase=validate status=failed — aborting sync"
    exit 1
  fi
fi

# ── Phase 4: Web sync ─────────────────────────────────────────────────────────
if [[ "${OPENCLAW_MANUAL_SYNC:-0}" == "1" ]]; then
  log "phase=web-sync status=started mode=${OPENCLAW_SYNC_MODE:-git}"
  bash "$ROOT_DIR/scripts/push-update.sh" "${OPENCLAW_SYNC_MODE:-git}" || true
  log "phase=web-sync status=attempted"
else
  log "phase=web-sync status=skipped reason=OPENCLAW_MANUAL_SYNC-not-enabled"
fi

log "cycle=end"
