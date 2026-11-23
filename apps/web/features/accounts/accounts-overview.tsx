import { linkedAccountsResponse } from '@engagement-exchange/contracts';
import { BadgeCheck, ChevronLeft, Clock, Plus, UserRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/states/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/locale-link';
import { formatDateTime, formatNumber } from '@/lib/format';
import { serverRequest } from '@/lib/server-api';
import { RemoveLinkedButton } from './remove-linked-button';

export async function AccountsOverview() {
  const [t, { platforms }] = await Promise.all([
    getTranslations('accounts'),
    serverRequest(linkedAccountsResponse, '/linked-accounts'),
  ]);
  const [tiktok] = platforms;
  const used = tiktok?.used ?? 0;
  const limit = tiktok?.limit ?? 0;
  const accounts = tiktok?.accounts ?? [];
  const openClaims = (tiktok?.openClaims ?? []).filter(
    (claim) => claim.state === 'awaiting_follow',
  );
  const full = limit > 0 && used >= limit;

  return (
    <div className="flex flex-col gap-6">
      <section className="@container flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 @sm:flex-row @sm:items-center @sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">{t('slotsTitle')}</h2>
            <p className="text-muted-foreground">
              {t('slotsUsed', { used: formatNumber(used), limit: formatNumber(limit) })}
            </p>
          </div>
          {full ? (
            <p className="text-muted-foreground">{t('slotsFull')}</p>
          ) : (
            <LocaleLink href="/accounts/link" className={buttonVariants({ size: 'lg' })}>
              <Plus aria-hidden="true" />
              {t('linkAction')}
            </LocaleLink>
          )}
        </div>
        <div
          role="meter"
          aria-label={t('slotsTitle')}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={used}
          aria-valuetext={t('slotsUsed', { used: formatNumber(used), limit: formatNumber(limit) })}
          className="flex gap-1.5"
        >
          {Array.from({ length: limit }, (_, index) => (
            <span
              key={index}
              className={`h-2 flex-1 rounded-full ${index < used ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>
      </section>

      {openClaims.length > 0 && (
        <section aria-labelledby="open-claims" className="flex flex-col gap-3">
          <h2 id="open-claims" className="text-lg font-bold">
            {t('openTitle')}
          </h2>
          <ul className="flex flex-col gap-3">
            {openClaims.map((claim) => (
              <li key={claim.id}>
                <LocaleLink
                  href={`/accounts/link/${claim.id}`}
                  className="flex min-h-touch items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted"
                >
                  <Clock aria-hidden="true" className="size-5 shrink-0 text-primary" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <bdi dir="ltr" className="truncate text-start font-medium">
                      @{claim.handle}
                    </bdi>
                    <span className="text-sm text-muted-foreground">{t('openBody')}</span>
                  </span>
                  <ChevronLeft aria-hidden="true" className="size-5 shrink-0 ltr:rotate-180" />
                </LocaleLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon={<UserRound aria-hidden="true" />}
          title={t('emptyTitle')}
          body={t('emptyBody')}
        />
      ) : (
        <section aria-labelledby="linked-accounts" className="flex flex-col gap-3">
          <h2 id="linked-accounts" className="text-lg font-bold">
            {t('linkedTitle')}
          </h2>
          <ul className="flex flex-col gap-3">
            {accounts.map((account) => (
              <li
                key={account.claimId}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <BadgeCheck aria-hidden="true" className="size-6 shrink-0 text-primary" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <bdi dir="ltr" className="truncate text-start font-medium">
                    @{account.handle}
                  </bdi>
                  <span className="text-sm text-muted-foreground">
                    {t('linkedAt', { at: formatDateTime(account.linkedAt) })}
                  </span>
                </span>
                <RemoveLinkedButton
                  claimId={account.claimId}
                  handle={account.handle}
                  copy={{
                    remove: t('remove'),
                    confirm: t('removeConfirm'),
                    keep: t('removeKeep'),
                    failed: t('removeFailed'),
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
