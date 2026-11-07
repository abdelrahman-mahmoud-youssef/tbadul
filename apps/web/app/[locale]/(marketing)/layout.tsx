import { getTranslations } from 'next-intl/server';
import { Wordmark } from '@/components/brand/wordmark';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default async function MarketingLayout({ children }: LayoutProps<'/[locale]'>) {
  const t = await getTranslations('auth');
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Wordmark />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link href="/sign-in">{t('signIn')}</Link>
          </Button>
        </div>
      </header>
      {children}
    </div>
  );
}
