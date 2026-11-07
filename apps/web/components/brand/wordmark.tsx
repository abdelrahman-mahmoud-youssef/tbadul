import { getTranslations } from 'next-intl/server';
import { LocaleLink } from '@/i18n/locale-link';
import { BrandMark } from './brand-mark';

export async function Wordmark() {
  const t = await getTranslations('brand');
  return (
    <LocaleLink
      href="/"
      aria-label={t('home')}
      className="inline-flex min-h-touch items-center gap-2 rounded-lg text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <BrandMark className="size-8" />
      <span className="text-2xl leading-none font-bold text-foreground">{t('name')}</span>
    </LocaleLink>
  );
}
