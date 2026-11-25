import { linkedAccountsResponse } from '@engagement-exchange/contracts';
import { UserRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { UpcomingPlatforms } from '@/components/platform/upcoming-platforms';
import { EmptyState } from '@/components/states/empty-state';
import { serverRequest } from '@/lib/server-api';
import { PlatformAccountsSection } from './platform-accounts';

export async function AccountsOverview() {
  const [t, platformsCopy, { platforms }] = await Promise.all([
    getTranslations('accounts'),
    getTranslations('platforms'),
    serverRequest(linkedAccountsResponse, '/linked-accounts'),
  ]);
  const anyLinked = platforms.some((entry) => entry.accounts.length > 0);

  return (
    <div className="flex flex-col gap-8">
      {platforms.map((entry) => (
        <PlatformAccountsSection key={entry.platform} entry={entry} />
      ))}
      {anyLinked ? null : (
        <EmptyState
          icon={<UserRound aria-hidden="true" />}
          title={t('emptyTitle')}
          body={t('emptyBody')}
        />
      )}
      <UpcomingPlatforms title={platformsCopy('comingTitle')} body={platformsCopy('comingBody')} />
    </div>
  );
}
