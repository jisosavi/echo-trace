'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const NAV_ITEMS = [
    { href: '/' as const,            label: 'ECHO/trace' },
    { href: '/dashboard' as const,   label: t('dashboard') },
    { href: '/comparisons' as const, label: t('comparisons') },
    { href: '/console' as const,     label: t('console') },
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

        <div ref={ref} className="relative border-l border-zinc-600">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex h-full items-center px-5 text-sm font-semibold text-zinc-400 hover:bg-zinc-700 hover:text-white focus:outline-none cursor-pointer"
            aria-label="Select language"
          >
            {currentLocale.toUpperCase()}
            <span className="ml-2 text-zinc-500">{open ? '▲' : '▼'}</span>
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-0 w-24 border border-zinc-600 bg-zinc-800 shadow-lg">
              {LOCALES.map(({ code, label }) => (
                <button
                  key={code}
                  onClick={() => { router.replace(pathname, { locale: code }); setOpen(false); }}
                  className={`w-full px-5 py-3 text-left text-sm font-semibold transition-colors ${
                    code === currentLocale
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
