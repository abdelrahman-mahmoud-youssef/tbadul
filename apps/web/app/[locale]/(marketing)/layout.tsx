import { getTranslations } from 'next-intl/server';
import { Wordmark } from '@/components/brand/wordmark';
import { ThemeSwitch } from '@/components/theme/theme-switch';
import { buttonVariants } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/locale-link';

export default async function MarketingLayout({ children }: LayoutProps<'/[locale]'>) {
  const t = await getTranslations('auth');
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Wordmark />
        <div className="flex items-center gap-1">
          <ThemeSwitch />
          <LocaleLink href="/sign-in" className={buttonVariants({ variant: 'ghost' })}>
            {t('signIn')}
          </LocaleLink>
        </div>
      </header>
      {children}
    </div>
  );
}
