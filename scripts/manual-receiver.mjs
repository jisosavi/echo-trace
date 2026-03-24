#!/usr/bin/env node
import { createHmac, timingSafeEqual } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const LOG_PATH = path.join(ROOT_DIR, 'agent/data/openclaw.log');
const PORT = Number(process.env.OPENCLAW_RECEIVER_PORT || 8787);
const SHARED_SECRET = process.env.OPENCLAW_SHARED_SECRET || '';
const MAX_SKEW_MS = 5 * 60 * 1000;
const seenNonces = new Map();

function pruneNonces(now) {
  for (const [nonce, seenAt] of seenNonces.entries()) {
    if (now - seenAt > MAX_SKEW_MS) {
      seenNonces.delete(nonce);
    }
  }
}

function safeEqualHex(expectedHex, providedHex) {
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(providedHex, 'hex');
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}

function signPayload(payload) {
  return createHmac('sha256', SHARED_SECRET).update(payload).digest('hex');
}

async function logLine(message) {
  const timestamp = new Date().toISOString();
  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  await appendFile(LOG_PATH, `[${timestamp}] [manual-receiver] ${message}\n`, 'utf8');
}

function runManualTask(targetUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [path.join(ROOT_DIR, 'scripts/manual-task.sh'), targetUrl], {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`manual-task exited with code ${code ?? 'unknown'}`));
    });
    child.on('error', reject);
  });
}

if (!SHARED_SECRET) {
  console.error('Set OPENCLAW_SHARED_SECRET before starting manual receiver.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/manual-trigger') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const payload = Buffer.concat(chunks).toString('utf8');
      const providedSignature = req.headers['x-openclaw-signature'];
      if (typeof providedSignature !== 'string' || !providedSignature) {
        res.writeHead(401);
        res.end('Missing signature');
        return;
      }

      const expectedSignature = signPayload(payload);
      if (!safeEqualHex(expectedSignature, providedSignature)) {
        res.writeHead(401);
        res.end('Invalid signature');
        return;
      }

      const body = JSON.parse(payload);
      const targetUrl = String(body.target_url || '').trim();
      const timestamp = Number(body.timestamp || 0);
      const nonce = String(body.nonce || '');

      if (!targetUrl || !/^https?:\/\//.test(targetUrl)) {
        res.writeHead(400);
        res.end('Invalid target_url');
        return;
      }
      if (!nonce) {
        res.writeHead(400);
        res.end('Missing nonce');
        return;
      }

      const now = Date.now();
      pruneNonces(now);
      if (Math.abs(now - timestamp) > MAX_SKEW_MS) {
        res.writeHead(401);
        res.end('Stale timestamp');
        return;
      }
      if (seenNonces.has(nonce)) {
        res.writeHead(409);
        res.end('Replay detected');
        return;
      }
      seenNonces.set(nonce, now);

      await logLine(`accepted trigger for ${targetUrl}`);
      await runManualTask(targetUrl);
      await logLine(`completed trigger for ${targetUrl}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      await logLine(`trigger failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      res.writeHead(500);
      res.end('Trigger execution failed');
    }
  });
});

server.listen(PORT, () => {
  console.log(`OpenClaw manual receiver listening on http://127.0.0.1:${PORT}/manual-trigger`);
});
