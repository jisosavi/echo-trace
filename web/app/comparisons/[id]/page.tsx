import comparisons from '@/public/data/comparisons.json';
import Link from 'next/link';
import { notFound } from 'next/navigation';

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
  historical_echo?: {
    figure: string;
    year: string;
    quote: string;
    context: string;
  };
  divergence_note?: string;
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

function ellulTypeBadge(t: string) {
  return t === 'agitation'
    ? 'border-amber-800 bg-amber-900/40 text-amber-300'
    : 'border-teal-800 bg-teal-900/40 text-teal-300';
}

function TagList({ items, className = 'border-zinc-700 bg-zinc-800/60 text-zinc-300' }: { items: string[]; className?: string }) {
  if (!items.length) return <span className="text-zinc-600 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className={`rounded border px-2 py-0.5 text-xs ${className}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DimRow({ label, children }: { label: string; children: any }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-4 border-b border-zinc-800 py-3 text-sm last:border-0">
      <dt className="font-medium text-zinc-500 pt-0.5">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function ComparisonDetailPage({ params }: { params: { id: string } }) {
  const data = comparisons as Comparison[];
  const item = data.find((entry) => entry.id === params.id);

  if (!item) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
      <Link className="text-sm text-zinc-400 hover:text-zinc-200" href="/comparisons">
        ← Back to feed
      </Link>

      {/* Header */}
      <div className="mt-6">
        <p className="text-xs text-zinc-500">{new Date(item.timestamp).toLocaleString()}</p>
        <h1 className="mt-2 text-3xl font-semibold">{item.historical_parallel}</h1>
      </div>

      {/* Contemporary quote */}
      <blockquote className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-zinc-200 leading-relaxed">"{item.contemporary_quote}"</p>
        <footer className="mt-3 text-sm text-zinc-500">
          <a
            href={item.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-sky-300"
          >
            {item.source.publication}
          </a>
        </footer>
      </blockquote>

      {/* Historical echo */}
      {item.historical_echo && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Historical Echo
          </h2>
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-5">
            <div className="mb-3 flex items-baseline gap-3">
              <span className="font-semibold text-zinc-200">{item.historical_echo.figure}</span>
              {item.historical_echo.year && (
                <span className="text-xs text-zinc-500">{item.historical_echo.year}</span>
              )}
              {item.historical_echo.context && (
                <span className="text-xs text-zinc-500">— {item.historical_echo.context}</span>
              )}
            </div>
            <blockquote className="border-l-2 border-zinc-600 pl-4 text-zinc-300 italic">
              "{item.historical_echo.quote}"
            </blockquote>
          </div>
        </section>
      )}

      {/* Divergence note */}
      {item.divergence_note && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Divergence Note
          </h2>
          <p className="text-sm leading-relaxed text-zinc-300 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            {item.divergence_note}
          </p>
        </section>
      )}

      {/* Multi-dimensional analysis */}
      {item.analysis && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Analytical Dimensions
          </h2>
          <dl className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-5">
            {item.analysis.theme && (
              <DimRow label="Theme">
                <span className="text-zinc-200 text-sm">{item.analysis.theme}</span>
              </DimRow>
            )}

            {item.analysis.narrative_strategy && (
              <DimRow label="Narrative strategy">
                <span className={`rounded border px-2 py-0.5 text-xs ${strategyBadge(item.analysis.narrative_strategy)}`}>
                  {item.analysis.narrative_strategy}
                </span>
                <span className="ml-3 text-xs text-zinc-500">Lank &amp; Antai 2025</span>
              </DimRow>
            )}

            {item.analysis.nimmo_4d && (
              <DimRow label="Nimmo 4D">
                <span className={`rounded border px-2 py-0.5 text-xs ${nimmoBadge(item.analysis.nimmo_4d)}`}>
                  {item.analysis.nimmo_4d}
                </span>
                <span className="ml-3 text-xs text-zinc-500">DFRLab / Ben Nimmo</span>
              </DimRow>
            )}

            {item.analysis.ellul_type && (
              <DimRow label="Ellul type">
                <span className={`rounded border px-2 py-0.5 text-xs ${ellulTypeBadge(item.analysis.ellul_type)}`}>
                  {item.analysis.ellul_type}
                </span>
                {item.analysis.ellul_axis && (
                  <span className="ml-2 rounded border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-400">
                    {item.analysis.ellul_axis}
                  </span>
                )}
                <span className="ml-3 text-xs text-zinc-500">Ellul 1965</span>
              </DimRow>
            )}

            {item.analysis.san_martino_techniques && (
              <DimRow label="Techniques (18)">
                <div>
                  <TagList items={item.analysis.san_martino_techniques} />
                  <p className="mt-1.5 text-xs text-zinc-600">Da San Martino et al., ACL 2019</p>
                </div>
              </DimRow>
            )}

            {item.analysis.ipa_techniques && (
              <DimRow label="IPA techniques">
                <div>
                  <TagList items={item.analysis.ipa_techniques} />
                  <p className="mt-1.5 text-xs text-zinc-600">Institute for Propaganda Analysis, 1937</p>
                </div>
              </DimRow>
            )}

            {item.analysis.eco_properties && (
              <DimRow label="Ur-Fascism features">
                <div>
                  <TagList items={item.analysis.eco_properties} />
                  <p className="mt-1.5 text-xs text-zinc-600">Umberto Eco, 1995</p>
                </div>
              </DimRow>
            )}
          </dl>
        </section>
      )}

      {/* Metadata */}
      <section className="mt-8 border-t border-zinc-800 pt-6">
        <dl className="grid gap-2 text-sm text-zinc-400">
          <div>
            <dt className="inline font-medium text-zinc-300">Confidence:</dt>{' '}
            <dd className="inline">{Math.round(item.confidence * 100)}%</dd>
          </div>
          <div>
            <dt className="inline font-medium text-zinc-300">Tropes:</dt>{' '}
            <dd className="inline">{item.tropes.join(', ')}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-zinc-300">Notes:</dt>{' '}
            <dd className="inline">{item.notes}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
