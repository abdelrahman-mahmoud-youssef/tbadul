import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shell/page-header';
import { AccountsOverview } from '@/features/accounts/accounts-overview';

export default async function AccountsPage() {
  const t = await getTranslations('accounts');
  return (
    <>
      <PageHeader title={t('title')} />
      <AccountsOverview />
    </>
  );
}
