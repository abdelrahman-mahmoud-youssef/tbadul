import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/shell/page-header';
import { AccountsOverview } from '@/features/accounts/accounts-overview';

export default function AccountsPage() {
  const t = useTranslations('accounts');
  return (
    <>
      <PageHeader title={t('title')} />
      <AccountsOverview />
    </>
  );
}
