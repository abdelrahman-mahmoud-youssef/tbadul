import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shell/page-header';
import { LinkSteps } from '@/features/accounts/link-steps';
import { LinkStartForm } from '@/features/accounts/link-start-form';
import { PlatformPicker } from '@/features/accounts/platform-picker';
import { localizedPath } from '@/i18n/paths';
import { platformFrom } from '@/lib/platforms';

interface LinkAccountPageProps {
  readonly searchParams: Promise<{ readonly platform?: string | string[] }>;
}

export default async function LinkAccountPage({ searchParams }: LinkAccountPageProps) {
  const [t, platforms, locale, query] = await Promise.all([
    getTranslations('link'),
    getTranslations('platforms'),
    getLocale(),
    searchParams,
  ]);
  const platform = platformFrom(query.platform);
  return (
    <>
      <div className="flex flex-col gap-2">
        <PageHeader title={t('title')} />
        <p className="text-muted-foreground">{t('lead')}</p>
      </div>
      <PlatformPicker selected={platform} title={platforms('choose')} />
      <LinkSteps current="account" />
      <section className="rounded-2xl border border-border bg-card p-5">
        <LinkStartForm
          platform={platform}
          claimPath={localizedPath('/accounts/link', locale)}
          copy={{
            label: t('accountLabel'),
            hint: platforms(`${platform}.accountHint`),
            submit: t('start'),
            pending: t('checking'),
          }}
        />
      </section>
    </>
  );
}
