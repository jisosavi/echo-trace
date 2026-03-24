# HOOK: manual-analysis
# Event: manual_task

## Description
Receives signed webhook requests from the website and forces a one-off analysis pipeline for a specific URL.

## Security Contract
- Request body JSON must include: `target_url`, `timestamp`, `nonce`.
- Header `X-OpenClaw-Signature` must be `HMAC_SHA256(raw_body, OPENCLAW_SHARED_SECRET)`.
- Reject if timestamp skew is over 5 minutes.
- Reject if nonce was already seen (replay protection).

## Runtime
1. Receive webhook at `POST /manual-trigger`.
2. Verify signature, timestamp, and nonce.
3. Execute `scripts/manual-task.sh <target_url>`.
4. Log acceptance and completion in `agent/data/openclaw.log`.
