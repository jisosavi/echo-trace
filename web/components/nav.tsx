'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useParams } from 'next/navigation';

const LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'de', label: 'DE' },
  { code: 'ru', label: 'RU' },
  { code: 'zh', label: 'ZH' },
  { code: 'it', label: 'IT' },
  { code: 'es', label: 'ES' },
  { code: 'pt', label: 'PT' },
  { code: 'zu', label: 'ZU' },
] as const;

export function Nav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const currentLocale = (params.locale as string) ?? 'en';

  const NAV_ITEMS = [
    { href: '/dashboard' as const,   label: 'ECHO/trace' },
    { href: '/comparisons' as const, label: t('comparisons') },
    { href: '/console' as const,     label: t('console') },
    { href: '/' as const,            label: t('about') },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b-2 border-zinc-600 bg-zinc-800">
      <div className="flex">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 items-center justify-center py-5 text-sm font-semibold tracking-widest transition-colors ${
                active
                  ? 'border-b-2 border-white bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {label}
            </Link>
          );
        })}

        <select
          value={currentLocale}
          onChange={(e) => router.replace(pathname, { locale: e.target.value })}
          className="border-l border-zinc-600 bg-zinc-800 px-3 text-xs font-semibold text-zinc-400 hover:bg-zinc-700 hover:text-white focus:outline-none cursor-pointer"
          aria-label="Select language"
        >
          {LOCALES.map(({ code, label }) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
      </div>
    </nav>
  );
}
