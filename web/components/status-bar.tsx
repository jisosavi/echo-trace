'use client';

import { useEffect, useState } from 'react';
import { formatUTC } from '@/lib/format';

type Status = {
  lastScrape: string | null;
  lastAnalysis: string | null;
  isActive: boolean;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function StatusBar({ show = ['scrape', 'analysis'] }: {
  show?: ('scrape' | 'analysis')[];
}) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const poll = () =>
      fetch('/api/status')
        .then((r) => r.json() as Promise<Status>)
        .then(setStatus)
        .catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  if (!status) return null;

  const showScrape = show.includes('scrape');
  const showAnalysis = show.includes('analysis');

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs">

      {status.isActive && (
        <span className="flex items-center gap-2 font-medium text-emerald-400">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" />
          Cycle running
        </span>
      )}

      {showScrape && status.lastScrape && (
        <span className="text-zinc-500" title={formatUTC(status.lastScrape)}>
          Last scraped:{' '}
          <span className="text-zinc-300">{timeAgo(status.lastScrape)}</span>
          <span className="ml-1.5 text-zinc-600">({formatUTC(status.lastScrape)})</span>
        </span>
      )}

      {showAnalysis && status.lastAnalysis && (
        <span className="text-zinc-500" title={formatUTC(status.lastAnalysis)}>
          Last analysed:{' '}
          <span className="text-zinc-300">{timeAgo(status.lastAnalysis)}</span>
          <span className="ml-1.5 text-zinc-600">({formatUTC(status.lastAnalysis)})</span>
        </span>
      )}

      {!status.isActive && !status.lastScrape && !status.lastAnalysis && (
        <span className="text-zinc-600">No cycle data yet.</span>
      )}

    </div>
  );
}
