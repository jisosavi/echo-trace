#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-git}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$MODE" == "git" ]]; then
  : "${DEPLOY_BRANCH:=main}"
  git add web/public/data/comparisons.json || true
  git add agent/data/openclaw.log || true
  if git diff --cached --quiet; then
    echo "No changes to deploy."
    exit 0
  fi
  git commit -m "chore: publish OpenClaw cycle update"
  git push origin "$DEPLOY_BRANCH"
  echo "GitOps deployment complete."
elif [[ "$MODE" == "ssh" ]]; then
  : "${DEPLOY_HOST:?Set DEPLOY_HOST for ssh mode}"
  : "${DEPLOY_PATH:?Set DEPLOY_PATH for ssh mode}"
  rsync -avz web/public/data/ "$DEPLOY_HOST":"$DEPLOY_PATH"/data/
  echo "SSH deployment complete."
else
  echo "Usage: bash scripts/push-update.sh [git|ssh]"
  exit 1
fi
