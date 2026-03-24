import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();
const MAX_LINES = 120;
const POLL_MS = 2000;

function resolveLogPath(): string {
  if (process.env.OPENCLAW_LOG_PATH) {
    return process.env.OPENCLAW_LOG_PATH;
  }

  // Running from `/web`, defaulting to monorepo sibling log file.
  return path.resolve(process.cwd(), '../agent/data/openclaw.log');
}

function tailLines(content: string, maxLines: number): string[] {
  const lines = content
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  return lines.slice(-maxLines);
}

function toSse(event: string, payload: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export async function GET(): Promise<Response> {
  const logPath = resolveLogPath();
  let heartbeatId: ReturnType<typeof setInterval> | undefined;
  let pollId: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let previous = '';

      const sendHeartbeat = () => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      };

      const sendSnapshot = async () => {
        try {
          const file = await fs.readFile(logPath, 'utf8');
          previous = file;
          const lines = tailLines(file, MAX_LINES);
          controller.enqueue(toSse('snapshot', lines));
        } catch {
          controller.enqueue(toSse('snapshot', []));
          controller.enqueue(toSse('status', { level: 'warn', message: `Log file not found at ${logPath}` }));
        }
      };

      const pollForUpdates = async () => {
        try {
          const latest = await fs.readFile(logPath, 'utf8');
          if (latest === previous) {
            return;
          }

          if (latest.startsWith(previous)) {
            const delta = latest.slice(previous.length);
            const lines = tailLines(delta, MAX_LINES);
            if (lines.length > 0) {
              controller.enqueue(toSse('append', lines));
            }
          } else {
            const lines = tailLines(latest, MAX_LINES);
            controller.enqueue(toSse('snapshot', lines));
          }

          previous = latest;
        } catch {
          // Source may be unavailable temporarily; wait for next poll.
        }
      };

      await sendSnapshot();
      heartbeatId = setInterval(sendHeartbeat, 15000);
      pollId = setInterval(() => {
        void pollForUpdates();
      }, POLL_MS);
    },
    cancel() {
      if (heartbeatId) {
        clearInterval(heartbeatId);
      }
      if (pollId) {
        clearInterval(pollId);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
