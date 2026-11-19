import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shell/page-header';
import { LinkSteps } from '@/features/accounts/link-steps';
import { LinkStartForm } from '@/features/accounts/link-start-form';
import { localizedPath } from '@/i18n/paths';

export default async function LinkAccountPage() {
  const [t, locale] = await Promise.all([getTranslations('link'), getLocale()]);
  return (
    <>
      <div className="flex flex-col gap-2">
        <PageHeader title={t('title')} />
        <p className="text-muted-foreground">{t('lead')}</p>
      </div>
      <LinkSteps current="account" />
      <section className="rounded-2xl border border-border bg-card p-5">
        <LinkStartForm
          claimPath={localizedPath('/accounts/link', locale)}
          copy={{
            label: t('accountLabel'),
            hint: t('accountHint'),
            submit: t('start'),
            pending: t('checking'),
          }}
        />
      </section>
    </>
  );
}
