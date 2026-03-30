import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Forensic Semiotics</h1>
      <p className="max-w-2xl text-zinc-300">
        Monitors contemporary authoritarian media and compares rhetorical structures with
        historical dictatorship archives.
      </p>
      <div className="flex gap-3">
        <Link
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900"
          href="/comparisons"
        >
          View Comparisons
        </Link>
      </div>
    </main>
  );
}
