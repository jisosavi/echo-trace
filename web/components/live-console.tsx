'use client';

import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

type LiveConsoleProps = { initialLogs?: string[] };

const MAX_LINES = 120;

function clipLogs(lines: string[]): string[] {
  return lines.slice(0, MAX_LINES);
}

export function LiveConsole({ initialLogs = [] }: LiveConsoleProps) {
  const t = useTranslations('console');
  const [logs, setLogs] = useState<string[]>(() => clipLogs([...initialLogs].reverse()));
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource('/api/logs');
    source.addEventListener('open', () => setConnected(true));
    source.addEventListener('error', () => setConnected(false));
    source.addEventListener('snapshot', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as string[];
      setLogs(clipLogs([...payload].reverse()));
    });
    source.addEventListener('append', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as string[];
      setLogs((current) => clipLogs([...payload].reverse().concat(current)));
    });
    source.addEventListener('status', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as { message?: string };
      if (payload.message) setLogs((current) => clipLogs([`[system] ${payload.message}`, ...current]));
    });
    return () => source.close();
  }, []);

  const statusLabel = useMemo(
    () => (connected ? t('streamingStatus') : t('disconnected')),
    [connected, t],
  );

  return (
    <section className="rounded-lg border border-zinc-800 bg-black/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">{t('liveConsoleLabel')}</h2>
        <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">{statusLabel}</p>
      </div>
      <div className="space-y-2 font-mono text-xs text-emerald-300">
        {logs.length === 0 ? <p className="text-zinc-500">{t('noLogs')}</p> : null}
        {logs.map((line, idx) => (
          <motion.p
            key={`${line}-${idx}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {line}
          </motion.p>
        ))}
      </div>
    </section>
  );
}
