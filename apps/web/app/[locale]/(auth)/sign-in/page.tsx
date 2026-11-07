import { LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState } from '@/components/states/empty-state';

export default function SignInPage() {
  const t = useTranslations('signIn');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState
        icon={<LogIn aria-hidden="true" />}
        title={t('emptyTitle')}
        body={t('emptyBody')}
      />
    </>
  );
}
