import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['ar'],
  defaultLocale: 'ar',
  localePrefix: 'as-needed',
  localeDetection: false,
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];

export const directions: Record<Locale, 'rtl' | 'ltr'> = { ar: 'rtl' };
