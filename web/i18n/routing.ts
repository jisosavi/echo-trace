import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'fr', 'de', 'ru', 'zh', 'it', 'es', 'pt', 'zu'],
  defaultLocale: 'en',
});

export type Locale = (typeof routing.locales)[number];
