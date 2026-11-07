import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';

export async function PageSkeleton() {
  const t = await getTranslations('states');
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-9 w-40" />
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-input bg-card px-6 py-10">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-6 w-full max-w-sm" />
      </div>
    </div>
  );
}
