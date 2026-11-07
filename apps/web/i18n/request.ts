import { hasLocale, type AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import * as rootParams from 'next/root-params';
import { routing } from './routing';

export default getRequestConfig(async ({ locale }) => {
  const requested = locale ?? (await rootParams.locale());
  if (!hasLocale(routing.locales, requested)) notFound();
  const messages = (await import(`../messages/${requested}.json`)) as {
    default: AbstractIntlMessages;
  };
  return { locale: requested, messages: messages.default };
});
