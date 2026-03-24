'use client';

import { FormEvent, useState } from 'react';

type TriggerResponse = {
  ok: boolean;
  message: string;
};

export function ManualTrigger() {
  const [targetUrl, setTargetUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/manual-trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targetUrl })
      });

      const payload = (await response.json()) as TriggerResponse;
      if (!response.ok || !payload.ok) {
        setStatus('error');
        setMessage(payload.message || 'Manual trigger failed.');
        return;
      }

      setStatus('ok');
      setMessage(payload.message);
    } catch {
      setStatus('error');
      setMessage('Network error while sending manual trigger.');
    }
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-black/40 p-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">Manual Trigger</h2>
      <p className="mt-2 text-sm text-zinc-300">
        Force a one-off analysis run by sending a signed webhook to your local OpenClaw receiver.
      </p>
      <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
        <input
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          type="url"
          placeholder="https://example.com/article"
          value={targetUrl}
          onChange={(event) => setTargetUrl(event.target.value)}
          required
        />
        <button
          className="w-fit rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={status === 'loading'}
        >
          {status === 'loading' ? 'Triggering...' : 'Analyze URL'}
        </button>
      </form>
      {message ? (
        <p className={`mt-3 text-sm ${status === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>{message}</p>
      ) : null}
    </section>
  );
}
