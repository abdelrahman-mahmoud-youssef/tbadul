import { UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/states/empty-state';

export function AccountsOverview() {
  const t = useTranslations('accounts');
  return (
    <EmptyState
      icon={<UserRound aria-hidden="true" />}
      title={t('emptyTitle')}
      body={t('emptyBody')}
    />
  );
}
