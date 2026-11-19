import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shell/page-header';
import { AdminOverview } from '@/features/admin/admin-overview';

export default async function AdminPage() {
  const t = await getTranslations('admin');
  return (
    <>
      <PageHeader title={t('title')} />
      <AdminOverview />
    </>
  );
}
