import { useTranslations } from 'next-intl';

export default function AboutPage() {
  const t = useTranslations('about');
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-16 mt-20">
      <h1 className="text-4xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="max-w-2xl text-lg leading-relaxed text-zinc-300">{t('lead')}</p>
      <p className="max-w-2xl text-sm leading-relaxed text-zinc-300">{t('body')}</p>
      <p className="text-sm text-zinc-300 italic">{t('tagline')}</p>
    </main>
  );
}
