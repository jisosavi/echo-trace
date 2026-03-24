import comparisons from '@/public/data/comparisons.json';
import Link from 'next/link';
import { LiveConsole } from '@/components/live-console';

type Comparison = {
  id: string;
  timestamp: string;
  source: { publication: string; url: string };
  contemporary_quote: string;
  historical_parallel: string;
  tropes: string[];
  confidence: number;
  notes: string;
};

export default function ComparisonsPage() {
  const data = comparisons as Comparison[];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Comparison Feed</h1>
          <p className="mt-2 text-zinc-400">Continuously updated forensic semiotic matches.</p>
        </div>
        <Link className="text-sm text-zinc-300 hover:text-white" href="/">
          Back home
        </Link>
      </header>

      <LiveConsole
        initialLogs={[
          '[OpenClaw] live console initialized',
          '[OpenClaw] waiting for stream events from /api/logs',
          `[OpenClaw] seed: ${data.length} comparison records loaded`
        ]}
      />

      <section className="grid gap-4">
        {data.map((item) => (
          <article key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <p className="mb-2 text-xs text-zinc-500">{new Date(item.timestamp).toLocaleString()}</p>
            <h2 className="text-lg font-medium">{item.historical_parallel}</h2>
            <p className="mt-3 text-zinc-300">"{item.contemporary_quote}"</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.tropes.map((trope) => (
                <span key={trope} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">{trope}</span>
              ))}
            </div>
            <a className="mt-4 inline-block text-sm text-sky-300 hover:text-sky-200" href={item.source.url}>
              Source: {item.source.publication}
            </a>
          </article>
        ))}
      </section>
    </main>
  );
}
