import comparisons from '@/public/data/comparisons.json';
import Link from 'next/link';
import { notFound } from 'next/navigation';

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

export default function ComparisonDetailPage({ params }: { params: { id: string } }) {
  const data = comparisons as Comparison[];
  const item = data.find((entry) => entry.id === params.id);

  if (!item) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
      <Link className="text-sm text-zinc-400 hover:text-zinc-200" href="/comparisons">Back to feed</Link>
      <h1 className="mt-4 text-3xl font-semibold">{item.historical_parallel}</h1>
      <p className="mt-4 text-zinc-300">"{item.contemporary_quote}"</p>
      <dl className="mt-6 grid gap-2 text-sm text-zinc-400">
        <div>
          <dt className="inline font-medium text-zinc-200">Source:</dt>{' '}
          <dd className="inline">{item.source.publication}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-zinc-200">Confidence:</dt>{' '}
          <dd className="inline">{Math.round(item.confidence * 100)}%</dd>
        </div>
        <div>
          <dt className="inline font-medium text-zinc-200">Notes:</dt>{' '}
          <dd className="inline">{item.notes}</dd>
        </div>
      </dl>
    </main>
  );
}
