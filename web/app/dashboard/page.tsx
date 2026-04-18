import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StatusBar } from '@/components/status-bar';
import { formatUTC } from '@/lib/format';

const DATA_DIR = path.resolve(process.cwd(), '../agent/data');
const COMPARISONS_PATH = path.resolve(process.cwd(), 'public/data/comparisons.json');

type Comparison = {
  id: string;
  timestamp: string;
  confidence: number;
  tropes: string[];
  analysis?: {
    narrative_strategy?: string;
    nimmo_4d?: string;
    ellul_type?: string;
    ellul_axis?: string;
    san_martino_techniques?: string[];
    ipa_techniques?: string[];
    eco_properties?: string[];
    eudisinfo_narratives?: string[];
    eudisinfo_rhetoric?: string[];
    eudisinfo_conspiracy?: string[];
    eudisinfo_ttp?: string[];
  };
};

type RawNewsRecord = {
  source: string;
  regime: string;
  url: string;
  retrieved_at: string;
};

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function countArray(comps: Comparison[], field: keyof NonNullable<Comparison['analysis']>) {
  const counts: Record<string, number> = {};
  for (const c of comps) {
    const val = c.analysis?.[field];
    if (Array.isArray(val)) {
      for (const v of val) counts[v] = (counts[v] ?? 0) + 1;
    }
  }
  return counts;
}

function countScalar(comps: Comparison[], field: keyof NonNullable<Comparison['analysis']>) {
  const counts: Record<string, number> = {};
  for (const c of comps) {
    const v = c.analysis?.[field];
    if (typeof v === 'string' && v) counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

async function loadStats() {
  const [comparisons, rawNews] = await Promise.all([
    readJson<Comparison[]>(COMPARISONS_PATH),
    readJson<RawNewsRecord[]>(path.join(DATA_DIR, 'raw-news.json')),
  ]);

  const comps = comparisons ?? [];
  const news = rawNews ?? [];

  const tropeCounts: Record<string, number> = {};
  let confidenceSum = 0;
  let confidenceN = 0;
  for (const c of comps) {
    const trope = c.tropes?.[0] ?? 'unclassified';
    tropeCounts[trope] = (tropeCounts[trope] ?? 0) + 1;
    if (c.confidence) { confidenceSum += c.confidence; confidenceN++; }
  }
  const tropeRanked = Object.entries(tropeCounts).sort((a, b) => b[1] - a[1]);
  const maxTrope = tropeRanked[0]?.[1] ?? 1;

  const sourceCounts: Record<string, { count: number; regime: string; lastSeen: string }> = {};
  for (const r of news) {
    const e = sourceCounts[r.source];
    if (!e) sourceCounts[r.source] = { count: 1, regime: r.regime, lastSeen: r.retrieved_at };
    else { e.count++; if (r.retrieved_at > e.lastSeen) e.lastSeen = r.retrieved_at; }
  }

  return {
    totalClassified: comps.length,
    avgConfidence: confidenceN > 0 ? confidenceSum / confidenceN : 0,
    tropeRanked,
    maxTrope,
    strategyCounts:   countScalar(comps, 'narrative_strategy'),
    nimmoCounts:      countScalar(comps, 'nimmo_4d'),
    ellulTypeCounts:  countScalar(comps, 'ellul_type'),
    ellulAxisCounts:  countScalar(comps, 'ellul_axis'),
    sanMartinoCounts: countArray(comps,  'san_martino_techniques'),
    ipaCounts:        countArray(comps,  'ipa_techniques'),
    ecoCounts:        countArray(comps,  'eco_properties'),
    narrativeCounts:  countArray(comps,  'eudisinfo_narratives'),
    rhetoricCounts:   countArray(comps,  'eudisinfo_rhetoric'),
    conspiracyCounts: countArray(comps,  'eudisinfo_conspiracy'),
    ttpCounts:        countArray(comps,  'eudisinfo_ttp'),
    totalNews: news.length,
    sourceRanked: Object.entries(sourceCounts).sort((a, b) => b[1].count - a[1].count),
  };
}

function pct(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

const NIMMO_COLORS: Record<string, string> = {
  Dismiss: 'bg-red-500', Distort: 'bg-orange-500',
  Distract: 'bg-amber-500', Dismay: 'bg-purple-500',
};
const STRATEGY_COLORS: Record<string, string> = {
  suppression: 'bg-rose-500', destruction: 'bg-orange-500',
  direction: 'bg-sky-500', exploitation: 'bg-violet-500',
};
const ELLUL_TYPE_COLORS: Record<string, string> = {
  agitation: 'bg-amber-500', integration: 'bg-teal-500',
};
const ELLUL_AXIS_COLORS: Record<string, string> = {
  vertical: 'bg-indigo-500', horizontal: 'bg-cyan-500',
};

function Ref({ name, url }: { name: string; url: string }) {
  return (
    <p className="mb-4 text-[11px] text-zinc-600">
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-zinc-400">
        {name}
      </a>
    </p>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function BarRow({ label, count, total, maxCount, color = 'bg-emerald-500' }: {
  label: string; count: number; total: number; maxCount: number; color?: string;
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3">
      <span className="truncate text-xs text-zinc-300">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${color}`}
          style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }} />
      </div>
      <span className="text-right font-mono text-xs text-zinc-400">{pct(count, total)}%</span>
    </div>
  );
}

function MiniBar({ label, count, total, color }: {
  label: string; count: number; total: number; color: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="capitalize text-zinc-300">{label}</span>
        <span className="font-mono text-zinc-400">
          {count} <span className="text-zinc-600">({pct(count, total)}%)</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct(count, total)}%` }} />
      </div>
    </div>
  );
}

function RankedBars({ counts, color }: { counts: Record<string, number>; color: string }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return <p className="text-xs text-zinc-600">No data yet.</p>;
  return (
    <div className="space-y-2">
      {ranked.map(([label, count]) => (
        <MiniBar key={label} label={label} count={count} total={total} color={color} />
      ))}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
        {children}
      </span>
      <div className="h-px flex-1 bg-zinc-800" />
    </div>
  );
}

export default async function DashboardPage() {
  const stats = await loadStats();

  const nimmoTotal    = Object.values(stats.nimmoCounts).reduce((a, b) => a + b, 0);
  const strategyTotal = Object.values(stats.strategyCounts).reduce((a, b) => a + b, 0);
  const ellulTypeTotal = Object.values(stats.ellulTypeCounts).reduce((a, b) => a + b, 0);
  const ellulAxisTotal = Object.values(stats.ellulAxisCounts).reduce((a, b) => a + b, 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-12">

      {/* Header */}
      <header>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-zinc-400">Scraping activity and propaganda classification overview.</p>
      </header>
      <StatusBar show={['scrape', 'analysis']} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Cases classified" value={stats.totalClassified.toLocaleString()} sub="comparisons analysed" />
        <StatCard label="Avg confidence"
          value={stats.avgConfidence > 0 ? `${Math.round(stats.avgConfidence * 100)}%` : '—'} />
        <StatCard label="Tropes detected"
          value={String(stats.tropeRanked.filter(([t]) => t !== 'unclassified').length)}
          sub="of 14 defined tropes" />
        <StatCard label="News articles"
          value={stats.totalNews > 0 ? stats.totalNews.toLocaleString() : '—'}
          sub={stats.totalNews > 0 ? `${stats.sourceRanked.length} sources` : 'scraping not yet run'} />
      </div>

      {/* Trope distribution */}
      {stats.tropeRanked.length > 0 && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">Historical Trope Distribution</h2>
          <Ref name="Forensic Semiotics Project — 14-trope authoritarian rhetoric taxonomy"
            url="https://github.com/jisosavi/forensic-semiotics" />
          <div className="space-y-3">
            {stats.tropeRanked.map(([trope, count]) => (
              <BarRow key={trope} label={trope} count={count}
                total={stats.totalClassified} maxCount={stats.maxTrope}
                color={trope === 'unclassified' ? 'bg-zinc-600' : 'bg-emerald-500'} />
            ))}
          </div>
        </section>
      )}

      {/* ── Analytical framing ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <GroupLabel>Analytical framing</GroupLabel>
        <div className="grid gap-4 sm:grid-cols-2">

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">Narrative Strategy</h2>
            <Ref name="Lank & Antai — Strategic Narrative Typology, 2025"
              url="https://doi.org/10.1177/19401612251317696" />
            <div className="space-y-3">
              {(['suppression', 'destruction', 'direction', 'exploitation'] as const).map((s) => (
                <MiniBar key={s} label={s} count={stats.strategyCounts[s] ?? 0}
                  total={strategyTotal} color={STRATEGY_COLORS[s]} />
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">Nimmo 4D</h2>
            <Ref name="Ben Nimmo — DFRLab, 4D Approach to Counter Disinformation"
              url="https://euvsdisinfo.eu/the-4d-approach/" />
            <div className="space-y-3">
              {(['Dismiss', 'Distort', 'Distract', 'Dismay'] as const).map((d) => (
                <MiniBar key={d} label={d} count={stats.nimmoCounts[d] ?? 0}
                  total={nimmoTotal} color={NIMMO_COLORS[d]} />
              ))}
            </div>
          </section>

        </div>
      </div>

      {/* ── Ellul ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <GroupLabel>Ellul — Propaganda (1965)</GroupLabel>
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">Ellul Type &amp; Axis</h2>
          <Ref name="Jacques Ellul — Propaganda: The Formation of Men's Attitudes, 1965"
            url="https://en.wikipedia.org/wiki/Propaganda_(Ellul_book)" />
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-wide text-zinc-600">Type</p>
              {(['agitation', 'integration'] as const).map((e) => (
                <MiniBar key={e} label={e} count={stats.ellulTypeCounts[e] ?? 0}
                  total={ellulTypeTotal} color={ELLUL_TYPE_COLORS[e]} />
              ))}
            </div>
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-wide text-zinc-600">Axis</p>
              {(['vertical', 'horizontal'] as const).map((a) => (
                <MiniBar key={a} label={a} count={stats.ellulAxisCounts[a] ?? 0}
                  total={ellulAxisTotal} color={ELLUL_AXIS_COLORS[a]} />
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ── Technique taxonomies ───────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <GroupLabel>Technique taxonomies</GroupLabel>
        <div className="grid gap-4 sm:grid-cols-3">

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">Techniques (18)</h2>
            <Ref name="Da San Martino et al. — Fine-Grained Analysis of Propaganda, ACL 2019"
              url="https://aclanthology.org/W19-2006/" />
            <RankedBars counts={stats.sanMartinoCounts} color="bg-emerald-600" />
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">IPA Techniques (7)</h2>
            <Ref name="Institute for Propaganda Analysis — 7 Techniques, 1937"
              url="https://en.wikipedia.org/wiki/Institute_for_Propaganda_Analysis" />
            <RankedBars counts={stats.ipaCounts} color="bg-yellow-600" />
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">Ur-Fascism (14)</h2>
            <Ref name="Umberto Eco — Ur-Fascism, 14 features, 1995"
              url="https://en.wikipedia.org/wiki/Ur-Fascism" />
            <RankedBars counts={stats.ecoCounts} color="bg-rose-600" />
          </section>

        </div>
      </div>

      {/* ── EUvsDisinfo ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <GroupLabel>EUvsDisinfo dimensions</GroupLabel>
        <div className="grid gap-4 sm:grid-cols-2">

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">Pro-Kremlin Narratives</h2>
            <Ref name="EUvsDisinfo — 6 Key Pro-Kremlin Narratives"
              url="https://euvsdisinfo.eu/disinformation-cases/" />
            <RankedBars counts={stats.narrativeCounts} color="bg-red-600" />
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">Rhetoric (SWAMPED)</h2>
            <Ref name="EUvsDisinfo — Modus Trollerandi, 7 rhetorical devices"
              url="https://euvsdisinfo.eu/modus-trollerandi-the-kremlin-rhetoric/" />
            <RankedBars counts={stats.rhetoricCounts} color="bg-orange-600" />
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">Conspiracy Patterns</h2>
            <Ref name="EUvsDisinfo — Conspiracy Theory Archetypes"
              url="https://euvsdisinfo.eu/disinformation-cases/" />
            <RankedBars counts={stats.conspiracyCounts} color="bg-violet-600" />
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">TTP Framework</h2>
            <Ref name="DISARM Framework / EUvsDisinfo — Tactics, Techniques & Procedures"
              url="https://www.disarmframework.com/" />
            <RankedBars counts={stats.ttpCounts} color="bg-yellow-700" />
          </section>

        </div>
      </div>

      {/* Source scraping status */}
      {stats.sourceRanked.length > 0 && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-400">
            Source Activity <span className="normal-case text-zinc-600">({stats.sourceRanked.length} sources)</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-500">
                  <th className="pb-2 pr-4 font-normal">Source</th>
                  <th className="pb-2 pr-4 font-normal">Regime</th>
                  <th className="pb-2 pr-4 font-normal tabular-nums">Articles</th>
                  <th className="pb-2 font-normal">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {stats.sourceRanked.map(([source, data]) => (
                  <tr key={source} className="text-zinc-300">
                    <td className="py-2 pr-4">{source}</td>
                    <td className="py-2 pr-4 text-zinc-500">{data.regime}</td>
                    <td className="py-2 pr-4 font-mono">{data.count}</td>
                    <td className="py-2 text-zinc-500">{formatUTC(data.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </main>
  );
}
