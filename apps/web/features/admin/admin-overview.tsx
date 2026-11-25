import { fallbacksResponse, poolResponse } from '@engagement-exchange/contracts';
import { ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/states/empty-state';
import { formatDateTime, formatNumber } from '@/lib/format';
import { serverRequest } from '@/lib/server-api';
import { PoolAddForm } from './pool-add-form';
import { PoolToggle } from './pool-toggle';

export async function AdminOverview() {
  const [t, { pools }, { counts }] = await Promise.all([
    getTranslations('admin'),
    serverRequest(poolResponse, '/admin/pool'),
    serverRequest(fallbacksResponse, '/admin/fallbacks'),
  ]);
  const accounts = pools.flatMap((pool) => pool.accounts);

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="pool-add"
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 id="pool-add" className="text-lg font-bold">
            {t('addTitle')}
          </h2>
          <p className="text-muted-foreground">{t('addLead')}</p>
        </div>
        <PoolAddForm
          copy={{
            label: t('addLabel'),
            hint: t('addHint'),
            submit: t('addSubmit'),
            pending: t('addPending'),
            statuses: {
              added: t('statuses.added'),
              present: t('statuses.present'),
              inactive: t('statuses.inactive'),
            },
          }}
        />
      </section>

      <section aria-labelledby="pool-list" className="flex flex-col gap-3">
        <h2 id="pool-list" className="text-lg font-bold">
          {t('poolTitle')}
        </h2>
        {accounts.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck aria-hidden="true" />}
            title={t('emptyTitle')}
            body={t('emptyBody')}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {accounts.map((account) => (
              <li
                key={account.accountId}
                className="@container rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex flex-col gap-3 @sm:flex-row @sm:items-center">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-start font-bold">
                      <bdi dir="ltr">
                        {account.handle === undefined ? account.accountId : `@${account.handle}`}
                      </bdi>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {account.active ? t('active') : t('inactive')}
                      {' · '}
                      {t('assigned', { count: formatNumber(account.assignedCount) })}
                    </span>
                  </div>
                  <PoolToggle
                    accountId={account.accountId}
                    active={account.active}
                    label={account.active ? t('deactivate') : t('activate')}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="fallbacks"
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 id="fallbacks" className="text-lg font-bold">
            {t('fallbacksTitle')}
          </h2>
          <p className="text-muted-foreground">{t('fallbacksLead')}</p>
        </div>
        {counts.length === 0 ? (
          <p className="text-muted-foreground">{t('fallbacksEmpty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {counts.map((entry) => (
              <li
                key={`${entry.source}-${entry.hour}`}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span dir="ltr" className="font-medium">
                  {entry.source}
                </span>
                <span className="text-sm text-muted-foreground">{formatDateTime(entry.hour)}</span>
                <span className="font-bold">{formatNumber(entry.count)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
