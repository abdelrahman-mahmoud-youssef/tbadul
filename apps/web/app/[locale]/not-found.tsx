import { Compass } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Wordmark } from '@/components/brand/wordmark';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('notFound');
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-10 px-4 pt-[env(safe-area-inset-top)] pb-16">
      <header className="py-3">
        <Wordmark />
      </header>
      <main className="flex flex-col items-start gap-4">
        <div className="grid size-14 place-items-center rounded-full bg-secondary text-secondary-foreground">
          <Compass aria-hidden="true" className="size-7" />
        </div>
        <h1 className="text-2xl leading-snug font-bold md:text-3xl">{t('title')}</h1>
        <p className="text-muted-foreground">{t('body')}</p>
        <Button asChild>
          <Link href="/">{t('home')}</Link>
        </Button>
      </main>
    </div>
  );
}
