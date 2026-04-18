'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard',   label: 'ECHO/trace' },
  { href: '/comparisons', label: 'RHETORICAL ECHOES' },
  { href: '/console',     label: 'LIVE CONSOLE' },
  { href: '/',            label: 'ABOUT' },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-50 border-b-2 border-zinc-600 bg-zinc-800">
      <div className="grid grid-cols-4">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-center py-5 text-sm font-semibold tracking-widest transition-colors ${
                active
                  ? 'border-b-2 border-white bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
