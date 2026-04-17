import comparisons from '@/public/data/comparisons.json';
import Link from 'next/link';
import { LiveConsole } from '@/components/live-console';

type Analysis = {
  theme?: string;
  narrative_strategy?: string;
  san_martino_techniques?: string[];
  ipa_techniques?: string[];
  nimmo_4d?: string;
  ellul_type?: string;
  ellul_axis?: string;
  eco_properties?: string[];
};

type Comparison = {
  id: string;
  timestamp: string;
  source: { publication: string; url: string };
  contemporary_quote: string;
  historical_parallel: string;
  tropes: string[];
  confidence: number;
  analysis?: Analysis;
  historical_echo?: { figure: string; year: string };
  notes: string;
};

function strategyBadge(s: string) {
  const map: Record<string, string> = {
    suppression:  'border-rose-800 bg-rose-900/40 text-rose-300',
    destruction:  'border-orange-800 bg-orange-900/40 text-orange-300',
    direction:    'border-sky-800 bg-sky-900/40 text-sky-300',
    exploitation: 'border-violet-800 bg-violet-900/40 text-violet-300',
  };
  return map[s] ?? 'border-zinc-700 bg-zinc-800 text-zinc-400';
}

function nimmoBadge(d: string) {
  const map: Record<string, string> = {
    Dismiss: 'border-red-800 bg-red-900/40 text-red-300',
    Distort: 'border-orange-800 bg-orange-900/40 text-orange-300',
    Distract: 'border-amber-800 bg-amber-900/40 text-amber-300',
    Dismay:  'border-purple-800 bg-purple-900/40 text-purple-300',
  };
  return map[d] ?? 'border-zinc-700 bg-zinc-800 text-zinc-400';
}

function ellulBadge(t: string) {
  return t === 'agitation'
    ? 'border-amber-800 bg-amber-900/40 text-amber-300'
    : 'border-teal-800 bg-teal-900/40 text-teal-300';
}

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
          '[cycle] live console initialized',
          '[cycle] waiting for stream events from /api/logs',
          `[cycle] seed: ${data.length} comparison records loaded`
        ]}
      />

      <section className="grid gap-4">
        {data.map((item) => (
          <article key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="mb-2 flex items-center justify-between gap-4">
              <p className="text-xs text-zinc-500">{new Date(item.timestamp).toLocaleString()}</p>
              <span className="text-xs text-zinc-500">{Math.round(item.confidence * 100)}% confidence</span>
            </div>

            <h2 className="text-lg font-medium">{item.historical_parallel}</h2>
            {item.historical_echo && (
              <p className="mt-0.5 text-xs text-zinc-500">
                vs. {item.historical_echo.figure}{item.historical_echo.year ? `, ${item.historical_echo.year}` : ''}
              </p>
            )}

            <p className="mt-3 line-clamp-3 text-sm text-zinc-300">"{item.contemporary_quote}"</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {item.tropes.map((trope) => (
                <span key={trope} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                  {trope}
                </span>
              ))}
              {item.analysis?.narrative_strategy && (
                <span className={`rounded border px-2 py-1 text-xs ${strategyBadge(item.analysis.narrative_strategy)}`}>
                  {item.analysis.narrative_strategy}
                </span>
              )}
              {item.analysis?.nimmo_4d && (
                <span className={`rounded border px-2 py-1 text-xs ${nimmoBadge(item.analysis.nimmo_4d)}`}>
                  {item.analysis.nimmo_4d}
                </span>
              )}
              {item.analysis?.ellul_type && (
                <span className={`rounded border px-2 py-1 text-xs ${ellulBadge(item.analysis.ellul_type)}`}>
                  {item.analysis.ellul_type}
                </span>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <a
                className="text-sm text-sky-300 hover:text-sky-200"
                href={item.source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.source.publication}
              </a>
              <Link
                href={`/comparisons/${item.id}`}
                className="text-sm text-zinc-400 hover:text-zinc-200"
              >
                Full analysis →
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
