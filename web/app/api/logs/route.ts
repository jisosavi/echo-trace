import { watch, type FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();
const MAX_LINES = 120;

function resolveLogPath(): string {
  if (process.env.CYCLE_LOG_PATH) {
    return process.env.CYCLE_LOG_PATH;
  }

  // Running from `/web`, defaulting to monorepo sibling log file.
  return path.resolve(process.cwd(), '../agent/data/cycle.log');
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
  let watcher: FSWatcher | undefined;
  let parentWatcher: FSWatcher | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let previous = '';

      const sendHeartbeat = () => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      };

      const sendSnapshot = async () => {
        try {
          const file = await readFile(logPath, 'utf8');
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
          const latest = await readFile(logPath, 'utf8');
          if (latest === previous) return;

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
          // Source may be unavailable temporarily; wait for next event.
        }
      };

      const attachFileWatcher = (targetPath: string) => {
        watcher = watch(targetPath, () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => void pollForUpdates(), 100);
        });
        watcher.on('error', () => {
          // File removed or inaccessible — next write will trigger parent watcher if needed.
        });
      };

      await sendSnapshot();
      heartbeatId = setInterval(sendHeartbeat, 15_000);

      try {
        attachFileWatcher(logPath);
      } catch {
        // Log file doesn't exist yet — watch parent directory for creation.
        try {
          parentWatcher = watch(path.dirname(logPath), (_, filename) => {
            if (filename === path.basename(logPath)) {
              parentWatcher?.close();
              parentWatcher = undefined;
              attachFileWatcher(logPath);
              void pollForUpdates();
            }
          });
        } catch {
          // Parent directory also inaccessible — no-op, snapshot already sent.
        }
      }
    },

    cancel() {
      if (heartbeatId) clearInterval(heartbeatId);
      if (debounce) clearTimeout(debounce);
      watcher?.close();
      parentWatcher?.close();
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
