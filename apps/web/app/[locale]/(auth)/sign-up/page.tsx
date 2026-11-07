import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState } from '@/components/states/empty-state';

export default function SignUpPage() {
  const t = useTranslations('signUp');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState
        icon={<UserPlus aria-hidden="true" />}
        title={t('emptyTitle')}
        body={t('emptyBody')}
      />
    </>
  );
}
