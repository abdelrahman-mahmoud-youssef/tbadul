import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState } from '@/components/states/empty-state';

export default function AdminPage() {
  const t = useTranslations('admin');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState
        icon={<ShieldCheck aria-hidden="true" />}
        title={t('emptyTitle')}
        body={t('emptyBody')}
      />
    </>
  );
}
