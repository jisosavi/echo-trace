import { getTranslations } from 'next-intl/server';
import { StatusBar } from '@/components/status-bar';
import { formatUTC } from '@/lib/format';
import { getTropeCount } from '@/lib/archive';
import { getAllComparisons, getBaselineStats, getSourceActivity, getTotalArticles, type CorpusStats } from '@/lib/db';

export const revalidate = 21600;

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

function countArray(comps: Comparison[], field: keyof NonNullable<Comparison['analysis']>) {
  const counts: Record<string, number> = {};
  for (const c of comps) {
    const val = c.analysis?.[field];
    if (Array.isArray(val)) for (const v of val) counts[v] = (counts[v] ?? 0) + 1;
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
  const comps = getAllComparisons('state') as Comparison[];
  const sources = getSourceActivity();
  const tropeCounts: Record<string, number> = {};
  let confidenceSum = 0, confidenceN = 0;
  for (const c of comps) {
    const trope = c.tropes?.[0] ?? 'unclassified';
    tropeCounts[trope] = (tropeCounts[trope] ?? 0) + 1;
    if (c.confidence) { confidenceSum += c.confidence; confidenceN++; }
  }
  const tropeRanked = Object.entries(tropeCounts).sort((a, b) => b[1] - a[1]);
  const maxTrope = tropeRanked[0]?.[1] ?? 1;
  return {
    totalClassified: comps.length,
    avgConfidence: confidenceN > 0 ? confidenceSum / confidenceN : 0,
    tropeRanked, maxTrope,
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
    totalNews: getTotalArticles(),
    sources,
    baseline: getBaselineStats(),
  };
}

function pct(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

const NIMMO_COLORS: Record<string, string> = {
  Dismiss: 'bg-red-500', Distort: 'bg-orange-500', Distract: 'bg-amber-500', Dismay: 'bg-purple-500',
};
const STRATEGY_COLORS: Record<string, string> = {
  suppression: 'bg-rose-500', destruction: 'bg-orange-500', direction: 'bg-sky-500', exploitation: 'bg-violet-500',
};
const ELLUL_TYPE_COLORS: Record<string, string> = { agitation: 'bg-amber-500', integration: 'bg-teal-500' };
const ELLUL_AXIS_COLORS: Record<string, string> = { vertical: 'bg-indigo-500', horizontal: 'bg-cyan-500' };

function Ref({ name, url }: { name: string; url: string }) {
  return (
    <p className="mb-4 text-[11px] text-zinc-600">
      <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-zinc-400">{name}</a>
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
        <div className={`h-full rounded-full ${color}`} style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }} />
      </div>
      <span className="text-right font-mono text-xs text-zinc-400">{pct(count, total)}%</span>
    </div>
  );
}

function MiniBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="capitalize text-zinc-300">{label}</span>
        <span className="font-mono text-zinc-400">{count} <span className="text-zinc-600">({pct(count, total)}%)</span></span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct(count, total)}%` }} />
      </div>
    </div>
  );
}

function RankedBars({ counts, color, noDataLabel }: { counts: Record<string, number>; color: string; noDataLabel: string }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return <p className="text-xs text-zinc-600">{noDataLabel}</p>;
  return (
    <div className="space-y-2">
      {ranked.map(([label, count]) => <MiniBar key={label} label={label} count={count} total={total} color={color} />)}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">{children}</span>
      <div className="h-px flex-1 bg-zinc-800" />
    </div>
  );
}

function Baseline({ stats, t }: { stats: Record<'state' | 'control', CorpusStats>; t: Awaited<ReturnType<typeof getTranslations>> }) {
  const rows: { label: string; value: (c: CorpusStats) => string }[] = [
    { label: t('baseline.analysed'), value: (c) => c.analysed.toLocaleString() },
    { label: t('baseline.propagandaShare'), value: (c) => (c.analysed ? `${pct(c.propaganda, c.analysed)}%` : '—') },
    { label: t('baseline.echoRate'), value: (c) => (c.analysed ? `${pct(c.echoes, c.analysed)}%` : '—') },
    { label: t('baseline.meanSimilarity'), value: (c) => (c.meanTopSimilarity != null ? c.meanTopSimilarity.toFixed(3) : '—') },
    { label: t('baseline.naziShare'), value: (c) => (c.echoes ? `${pct(c.nazi, c.echoes)}%` : '—') },
    { label: t('baseline.dehumanisation'), value: (c) => (c.meanDehumanisation != null ? c.meanDehumanisation.toFixed(1) : '—') },
  ];
  const max = Math.max(stats.state.analysed ? stats.state.echoes / stats.state.analysed : 0, stats.control.analysed ? stats.control.echoes / stats.control.analysed : 0, 0.01);
  const bar = (c: CorpusStats, color: string, label: string) => {
    const rate = c.analysed ? c.echoes / c.analysed : 0;
    return (
      <div className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3">
        <span className="text-xs text-zinc-300">{label}</span>
        <div className="h-3 overflow-hidden rounded bg-zinc-800">
          <div className={`h-full ${color}`} style={{ width: `${(rate / max) * 100}%` }} />
        </div>
        <span className="text-right font-mono text-xs text-zinc-400">{c.analysed ? `${Math.round(rate * 100)}%` : '—'}</span>
      </div>
    );
  };
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">{t('baseline.title')}</h2>
      <p className="mb-4 text-xs text-zinc-500">{t('baseline.subtitle')}</p>
      <div className="mb-5 space-y-2">
        {bar(stats.state, 'bg-emerald-500', t('baseline.state'))}
        {bar(stats.control, 'bg-sky-500', t('baseline.control'))}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-zinc-500">
            <th className="pb-2 pr-4 font-normal" />
            <th className="pb-2 pr-4 font-normal">{t('baseline.state')}</th>
            <th className="pb-2 font-normal">{t('baseline.control')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {rows.map((r) => (
            <tr key={r.label} className="text-zinc-300">
              <td className="py-1.5 pr-4 text-zinc-500">{r.label}</td>
              <td className="py-1.5 pr-4 font-mono">{r.value(stats.state)}</td>
              <td className="py-1.5 font-mono">{r.value(stats.control)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {stats.control.analysed < 30 && <p className="mt-3 text-[11px] text-amber-400/80">{t('baseline.smallSample', { n: stats.control.analysed })}</p>}
    </section>
  );
}

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const stats = await loadStats();
  const nimmoTotal    = Object.values(stats.nimmoCounts).reduce((a, b) => a + b, 0);
  const strategyTotal = Object.values(stats.strategyCounts).reduce((a, b) => a + b, 0);
  const ellulTypeTotal = Object.values(stats.ellulTypeCounts).reduce((a, b) => a + b, 0);
  const ellulAxisTotal = Object.values(stats.ellulAxisCounts).reduce((a, b) => a + b, 0);
  const noData = t('sections.noData');

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold">{t('title')}</h1>
        <p className="mt-2 text-zinc-400">{t('subtitle')}</p>
      </header>
      <StatusBar show={['scrape', 'analysis']} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t('stats.classified')} value={stats.totalClassified.toLocaleString()} sub={t('stats.classifiedSub')} />
        <StatCard label={t('stats.confidence')} value={stats.avgConfidence > 0 ? `${Math.round(stats.avgConfidence * 100)}%` : '—'} />
        <StatCard label={t('stats.tropes')} value={String(stats.tropeRanked.filter(([tr]) => tr !== 'unclassified').length)} sub={t('stats.tropesSub', { total: getTropeCount() })} />
        <StatCard label={t('stats.articles')}
          value={stats.totalNews > 0 ? stats.totalNews.toLocaleString() : '—'}
          sub={stats.totalNews > 0 ? t('stats.sources', { n: stats.sources.length }) : t('stats.noScrape')} />
      </div>

      <Baseline stats={stats.baseline} t={t} />

      {stats.tropeRanked.length > 0 && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">{t('sections.tropeDistribution')}</h2>
          <Ref name="ECHO/trace — 22-trope authoritarian rhetoric taxonomy" url="https://github.com/jisosavi/echo-trace" />
          <div className="space-y-3">
            {stats.tropeRanked.map(([trope, count]) => (
              <BarRow key={trope} label={trope} count={count} total={stats.totalClassified} maxCount={stats.maxTrope}
                color={trope === 'unclassified' ? 'bg-zinc-600' : 'bg-emerald-500'} />
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3">
        <GroupLabel>{t('sections.analyticalFraming')}</GroupLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">{t('sections.narrativeStrategy')}</h2>
            <Ref name="Lank & Antai — Strategic Narrative Typology, 2025" url="https://doi.org/10.1177/19401612251317696" />
            <div className="space-y-3">
              {(['suppression', 'destruction', 'direction', 'exploitation'] as const).map((s) => (
                <MiniBar key={s} label={s} count={stats.strategyCounts[s] ?? 0} total={strategyTotal} color={STRATEGY_COLORS[s]} />
              ))}
            </div>
          </section>
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">{t('sections.nimmo')}</h2>
            <Ref name="Ben Nimmo — DFRLab, 4D Approach to Counter Disinformation" url="https://euvsdisinfo.eu/the-4d-approach/" />
            <div className="space-y-3">
              {(['Dismiss', 'Distort', 'Distract', 'Dismay'] as const).map((d) => (
                <MiniBar key={d} label={d} count={stats.nimmoCounts[d] ?? 0} total={nimmoTotal} color={NIMMO_COLORS[d]} />
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <GroupLabel>{t('sections.ellul')}</GroupLabel>
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">{t('sections.ellulTypeAxis')}</h2>
          <Ref name="Jacques Ellul — Propaganda: The Formation of Men's Attitudes, 1965" url="https://en.wikipedia.org/wiki/Propaganda_(Ellul_book)" />
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-wide text-zinc-600">{t('sections.ellulType')}</p>
              {(['agitation', 'integration'] as const).map((e) => (
                <MiniBar key={e} label={e} count={stats.ellulTypeCounts[e] ?? 0} total={ellulTypeTotal} color={ELLUL_TYPE_COLORS[e]} />
              ))}
            </div>
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-wide text-zinc-600">{t('sections.ellulAxis')}</p>
              {(['vertical', 'horizontal'] as const).map((a) => (
                <MiniBar key={a} label={a} count={stats.ellulAxisCounts[a] ?? 0} total={ellulAxisTotal} color={ELLUL_AXIS_COLORS[a]} />
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-3">
        <GroupLabel>{t('sections.techniques')}</GroupLabel>
        <div className="grid gap-4 sm:grid-cols-3">
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">{t('sections.techniques18')}</h2>
            <Ref name="Da San Martino et al. — Fine-Grained Analysis of Propaganda, ACL 2019" url="https://aclanthology.org/W19-2006/" />
            <RankedBars counts={stats.sanMartinoCounts} color="bg-emerald-600" noDataLabel={noData} />
          </section>
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">{t('sections.ipa')}</h2>
            <Ref name="Institute for Propaganda Analysis — 7 Techniques, 1937" url="https://en.wikipedia.org/wiki/Institute_for_Propaganda_Analysis" />
            <RankedBars counts={stats.ipaCounts} color="bg-yellow-600" noDataLabel={noData} />
          </section>
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">{t('sections.urFascism')}</h2>
            <Ref name="Umberto Eco — Ur-Fascism, 14 features, 1995" url="https://en.wikipedia.org/wiki/Ur-Fascism" />
            <RankedBars counts={stats.ecoCounts} color="bg-rose-600" noDataLabel={noData} />
          </section>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <GroupLabel>{t('sections.euvsdisinfo')}</GroupLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">{t('sections.narratives')}</h2>
            <Ref name="EUvsDisinfo — 6 Key Pro-Kremlin Narratives" url="https://euvsdisinfo.eu/disinformation-cases/" />
            <RankedBars counts={stats.narrativeCounts} color="bg-red-600" noDataLabel={noData} />
          </section>
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">{t('sections.rhetoric')}</h2>
            <Ref name="EUvsDisinfo — Modus Trollerandi, 7 rhetorical devices" url="https://euvsdisinfo.eu/modus-trollerandi-the-kremlin-rhetoric/" />
            <RankedBars counts={stats.rhetoricCounts} color="bg-orange-600" noDataLabel={noData} />
          </section>
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">{t('sections.conspiracy')}</h2>
            <Ref name="EUvsDisinfo — Conspiracy Theory Archetypes" url="https://euvsdisinfo.eu/disinformation-cases/" />
            <RankedBars counts={stats.conspiracyCounts} color="bg-violet-600" noDataLabel={noData} />
          </section>
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-400">{t('sections.ttp')}</h2>
            <Ref name="DISARM Framework / EUvsDisinfo — Tactics, Techniques & Procedures" url="https://www.disarmframework.com/" />
            <RankedBars counts={stats.ttpCounts} color="bg-yellow-700" noDataLabel={noData} />
          </section>
        </div>
      </div>

      {stats.sources.length > 0 && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-400">
            {t('sections.sourceActivity')} <span className="normal-case text-zinc-600">({t('stats.sources', { n: stats.sources.length })})</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-500">
                  <th className="pb-2 pr-4 font-normal">{t('table.source')}</th>
                  <th className="pb-2 pr-4 font-normal">{t('table.regime')}</th>
                  <th className="pb-2 pr-4 font-normal tabular-nums">{t('table.articles')}</th>
                  <th className="pb-2 pr-4 font-normal tabular-nums">{t('baseline.echoRate')}</th>
                  <th className="pb-2 font-normal">{t('table.lastSeen')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {stats.sources.map((s) => (
                  <tr key={`${s.corpus}:${s.source}`} className="text-zinc-300">
                    <td className="py-2 pr-4">
                      {s.source}
                      {s.corpus === 'control' && <span className="ml-2 text-[10px] text-sky-400">{t('baseline.control')}</span>}
                    </td>
                    <td className="py-2 pr-4 text-zinc-500">{s.regime}</td>
                    <td className="py-2 pr-4 font-mono">{s.articles}</td>
                    <td className="py-2 pr-4 font-mono">{s.analysed > 0 ? `${pct(s.echoes, s.analysed)}%` : '—'}</td>
                    <td className="py-2 text-zinc-500">{formatUTC(s.lastSeen)}</td>
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
