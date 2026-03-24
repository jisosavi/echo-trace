---
name: web-sync
description: Deploy updated comparison data and logs to remote hosting via Git push or SSH sync shell scripts. Use when publication artifacts change and the web frontend must be refreshed.
---

# Web Sync

## Purpose
Push generated data updates to the web host after each autonomous cycle.

## Workflow
1. Verify changed files (`web/public/data/comparisons.json`, logs, manifests).
2. Choose deployment channel:
   - GitOps (`git add/commit/push`)
   - SSH copy (`rsync`/`scp`)
3. Execute script and capture status.
4. Record deployment result in cycle logs.

## Command
```bash
bash scripts/push-update.sh git
# or
bash scripts/push-update.sh ssh
```

## Expected Environment Variables
- `DEPLOY_REMOTE`
- `DEPLOY_BRANCH`
- `DEPLOY_HOST`
- `DEPLOY_PATH`
