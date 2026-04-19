import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getTranslations } from 'next-intl/server';
import { LiveConsole } from '@/components/live-console';
import { StatusBar } from '@/components/status-bar';
import { PropagandaMapLoader } from '@/components/propaganda-map-loader';

const LOG_PATH = path.resolve(process.cwd(), '../agent/data/cycle.log');

async function getInitialLogs(): Promise<string[]> {
  try {
    const content = await fs.readFile(LOG_PATH, 'utf8');
    return content.split('\n').map((l) => l.trimEnd()).filter(Boolean).slice(-80);
  } catch {
    return [];
  }
}

export default async function ConsolePage() {
  const t = await getTranslations('console');
  const initialLogs = await getInitialLogs();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold">{t('title')}</h1>
        <p className="mt-2 text-zinc-400">{t('subtitle')}</p>
      </header>
      <StatusBar show={['scrape', 'analysis']} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LiveConsole initialLogs={initialLogs} />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            {t('mappingTitle')}
          </h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
            <PropagandaMapLoader />
          </div>
          <p className="text-xs text-zinc-600">
            {t('freedomHouse')}{' '}
            <a
              href="https://freedomhouse.org/explore-the-map?type=fiw&year=2026"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
            >
              {t('freedomHouseLink')}
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
