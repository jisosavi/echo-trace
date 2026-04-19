import { useTranslations } from 'next-intl';

export default function AboutPage() {
  const t = useTranslations('about');
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-16 mt-20">
      <h1 className="text-5xl font-semibold tracking-tight mb-6">{t('title')}</h1>

      <p className="text-xl font-semibold text-green-400 leading-snug mb-8">
        {t('tagline')}
      </p>

      <p className="text-base leading-relaxed text-zinc-300 mb-4">
        {t('lead')}
      </p>

      <p className="text-base leading-relaxed text-zinc-300 mb-10">
        {t('output')}
      </p>

      <h2 className="text-2xl font-semibold tracking-tight mb-4">{t('howItWorksTitle')}</h2>

      <p className="text-base leading-relaxed text-zinc-300 mb-8">
        {t('mechanism')}
      </p>

      <div className="border-l-2 border-green-700 pl-5 flex flex-col gap-3">
        <p className="text-base text-zinc-400 leading-relaxed">{t('clinical')}</p>
        <p className="text-base text-zinc-400 leading-relaxed">{t('parallel')}</p>
        <p className="text-base font-semibold text-zinc-300">{t('closing')}</p>
      </div>
    </main>
  );
}
