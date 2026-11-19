import { claimIdParam, claimResponse } from '@engagement-exchange/contracts';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shell/page-header';
import { ClaimView } from '@/features/accounts/claim-view';
import { ApiRequestError } from '@/lib/api-error';
import { serverRequest } from '@/lib/server-api';

const loadClaim = async (id: string) => {
  try {
    return (await serverRequest(claimResponse, `/claims/${id}`)).claim;
  } catch (error) {
    if (error instanceof ApiRequestError && error.error.code === 'claim_not_found') notFound();
    throw error;
  }
};

export default async function ClaimPage({
  params,
}: PageProps<'/[locale]/accounts/link/[claimId]'>) {
  const parsed = claimIdParam.safeParse((await params).claimId);
  if (!parsed.success) notFound();
  const [t, claim] = await Promise.all([getTranslations('link'), loadClaim(parsed.data)]);
  return (
    <>
      <PageHeader title={t('title')} />
      <ClaimView claim={claim} />
    </>
  );
}
