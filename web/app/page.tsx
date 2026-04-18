export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-16 mt-20">
      <h1 className="text-4xl font-semibold tracking-tight">ECHO/trace: Forensic Semiotics</h1>
      <p className="max-w-2xl text-lg leading-relaxed text-zinc-300">
        Monitors contemporary authoritarian state media and compares rhetorical structures
        with historical authoritarian archives — exposing the inherited language of propaganda.
      </p>
      <p className="max-w-2xl text-sm leading-relaxed text-zinc-300">
        Every six hours it scrapes 30+ authoritarian state media outlets, identifies rhetorical
        patterns matching a structured trope taxonomy, and publishes forensic
        comparisons — each pairing a contemporary quote with its historical twin
        from 20th-century authoritarian archives.
      </p>
      <p className="text-sm text-zinc-300 italic">
        Authoritarian propaganda does not invent new language. It inherits it.
      </p>
       <p className="text-sm text-zinc-300 italic">
        Making that inheritance visible is the point.
      </p>
    </main>
  );
}
