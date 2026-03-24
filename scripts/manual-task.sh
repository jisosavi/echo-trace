#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="${1:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PATH="$ROOT_DIR/agent/data/openclaw.log"

if [[ -z "$TARGET_URL" ]]; then
  echo "Usage: bash scripts/manual-task.sh <target_url>"
  exit 1
fi

mkdir -p "$(dirname "$LOG_PATH")"

log() {
  local message="$1"
  local timestamp
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "[$timestamp] [manual-trigger] $message" >> "$LOG_PATH"
}

run_step() {
  local step_name="$1"
  local command_template="${2:-}"

  if [[ -z "$command_template" ]]; then
    log "step=$step_name status=skipped reason=no-command"
    return 0
  fi

  local command_to_run="${command_template//__TARGET_URL__/$TARGET_URL}"
  log "step=$step_name status=started command=\"$command_to_run\""

  if bash -lc "$command_to_run"; then
    log "step=$step_name status=ok"
    return 0
  fi

  log "step=$step_name status=failed"
  return 1
}

log "received url=$TARGET_URL"
log "pipeline=manual-analysis status=started"

# Required for meaningful manual runs. Example:
# export OPENCLAW_ANALYZE_COMMAND='node scripts/analyze-one-url.mjs "__TARGET_URL__"'
if [[ -z "${OPENCLAW_ANALYZE_COMMAND:-}" ]]; then
  log "pipeline=manual-analysis status=failed reason=OPENCLAW_ANALYZE_COMMAND-not-set"
  echo "Set OPENCLAW_ANALYZE_COMMAND before running manual-task.sh" >&2
  exit 1
fi

# 1) Analyze this specific URL and write intermediate artifacts.
run_step "analyze_url" "$OPENCLAW_ANALYZE_COMMAND"

# 2) Generate or update comparisons output from analysis artifacts.
run_step "historical_compare" "${OPENCLAW_COMPARE_COMMAND:-}"

# 3) Optional expansion when similarity is too low.
run_step "archive_expansion" "${OPENCLAW_EXPAND_COMMAND:-}"

# 4) Optional JSON validation gate.
# Example:
# export OPENCLAW_VALIDATE_COMMAND='python3 -m json.tool web/public/data/comparisons.json >/dev/null'
run_step "validate_output" "${OPENCLAW_VALIDATE_COMMAND:-}"

# Optional sync: disabled by default because deployment requirements differ by host.
if [[ "${OPENCLAW_MANUAL_SYNC:-0}" == "1" ]]; then
  if [[ -x "$ROOT_DIR/scripts/push-update.sh" ]]; then
    log "step=web_sync status=started mode=${OPENCLAW_SYNC_MODE:-git}"
    bash "$ROOT_DIR/scripts/push-update.sh" "${OPENCLAW_SYNC_MODE:-git}" || true
    log "step=web_sync status=attempted"
  else
    log "step=web_sync status=skipped reason=push-update.sh-missing"
  fi
else
  log "step=web_sync status=skipped reason=OPENCLAW_MANUAL_SYNC-not-enabled"
fi

log "pipeline=manual-analysis status=completed"
