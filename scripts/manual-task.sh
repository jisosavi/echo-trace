#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="${1:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PATH="$ROOT_DIR/agent/data/openclaw.log"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if [[ -z "$TARGET_URL" ]]; then
  echo "Usage: bash scripts/manual-task.sh <target_url>"
  exit 1
fi

mkdir -p "$(dirname "$LOG_PATH")"

{
  echo "[$TIMESTAMP] [manual-trigger] received: $TARGET_URL"
  echo "[$TIMESTAMP] [manual-trigger] analysis placeholder started"
} >> "$LOG_PATH"

# Optional hook: run your real analysis command if configured.
if [[ -n "${OPENCLAW_ANALYZE_COMMAND:-}" ]]; then
  bash -lc "$OPENCLAW_ANALYZE_COMMAND"
  echo "[$TIMESTAMP] [manual-trigger] analyze command completed" >> "$LOG_PATH"
else
  echo "[$TIMESTAMP] [manual-trigger] no OPENCLAW_ANALYZE_COMMAND configured; skipping analysis step" >> "$LOG_PATH"
fi

# Optional sync: disabled by default because deployment requirements differ by host.
if [[ "${OPENCLAW_MANUAL_SYNC:-0}" == "1" ]]; then
  if [[ -x "$ROOT_DIR/scripts/push-update.sh" ]]; then
    bash "$ROOT_DIR/scripts/push-update.sh" "${OPENCLAW_SYNC_MODE:-git}" || true
    echo "[$TIMESTAMP] [manual-trigger] sync attempted via push-update.sh" >> "$LOG_PATH"
  else
    echo "[$TIMESTAMP] [manual-trigger] push-update.sh not found; skipping sync" >> "$LOG_PATH"
  fi
fi

echo "[$TIMESTAMP] [manual-trigger] completed: $TARGET_URL" >> "$LOG_PATH"
