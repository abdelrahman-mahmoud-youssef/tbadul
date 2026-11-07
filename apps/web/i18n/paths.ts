import { routing, type Locale } from './routing';

export type AppPath = `/${string}`;

export const localizedPath = (path: AppPath, locale: Locale): string => {
  if (Object.is(locale, routing.defaultLocale)) return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
};
