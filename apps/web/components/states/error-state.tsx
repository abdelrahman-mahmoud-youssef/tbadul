'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api-client';

interface ErrorStateProps {
  readonly error: Error;
  readonly retry: () => void;
}

export function ErrorState({ error, retry }: ErrorStateProps) {
  const t = useTranslations();
  return (
    <section
      role="alert"
      className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center"
    >
      <div className="grid size-14 place-items-center rounded-full bg-muted text-destructive [&_svg]:size-7">
        <TriangleAlert aria-hidden="true" />
      </div>
      <div className="flex max-w-prose flex-col gap-1">
        <h2 className="text-lg font-bold">{t('states.errorTitle')}</h2>
        <p className="text-muted-foreground">
          {error instanceof ApiRequestError
            ? t(`errors.${error.error.code}`)
            : t('states.errorBody')}
        </p>
      </div>
      <Button variant="outline" onClick={retry}>
        {t('states.retry')}
      </Button>
    </section>
  );
}
