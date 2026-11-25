import type { PlatformAccounts } from '@engagement-exchange/contracts';
import { BadgeCheck, ChevronLeft, Clock, Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PlatformIcon } from '@/components/platform/platform-icon';
import { buttonVariants } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/locale-link';
import { formatDateTime, formatNumber } from '@/lib/format';
import { RemoveLinkedButton } from './remove-linked-button';

export async function PlatformAccountsSection({ entry }: { readonly entry: PlatformAccounts }) {
  const [t, names] = await Promise.all([getTranslations('accounts'), getTranslations('platforms')]);
  const { platform, used, limit, accounts } = entry;
  const openClaims = entry.openClaims.filter((claim) => claim.state === 'awaiting_follow');
  const full = limit > 0 && used >= limit;
  const slots = t('slotsUsed', { used: formatNumber(used), limit: formatNumber(limit) });

  return (
    <section aria-labelledby={`${platform}-title`} className="flex flex-col gap-4">
      <div className="@container flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 @sm:flex-row @sm:items-center @sm:justify-between">
          <div className="flex items-center gap-3">
            <PlatformIcon id={platform} />
            <div className="flex flex-col gap-0.5">
              <h2 id={`${platform}-title`} className="text-lg font-bold">
                {names(`${platform}.name`)}
              </h2>
              <p className="text-muted-foreground">{slots}</p>
            </div>
          </div>
          {full ? (
            <p className="text-muted-foreground">{t('slotsFull')}</p>
          ) : (
            <LocaleLink
              href={`/accounts/link?platform=${platform}`}
              className={buttonVariants({ size: 'lg' })}
            >
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
          aria-valuetext={slots}
          className="flex gap-1.5"
        >
          {Array.from({ length: limit }, (_, index) => (
            <span
              key={index}
              className={`h-2 flex-1 rounded-full ${index < used ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>
      </div>

      {openClaims.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="font-bold">{t('openTitle')}</h3>
          <ul className="flex flex-col gap-3">
            {openClaims.map((claim) => (
              <li key={claim.id}>
                <LocaleLink
                  href={`/accounts/link/${claim.id}`}
                  className="flex min-h-touch items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted"
                >
                  <Clock aria-hidden="true" className="size-5 shrink-0 text-primary" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-start font-medium">
                      <bdi dir="ltr">@{claim.handle}</bdi>
                    </span>
                    <span className="text-sm text-muted-foreground">{t('openBody')}</span>
                  </span>
                  <ChevronLeft aria-hidden="true" className="size-5 shrink-0 ltr:rotate-180" />
                </LocaleLink>
              </li>
            ))}
          </ul>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="font-bold">{t('linkedTitle')}</h3>
          <ul className="flex flex-col gap-3">
            {accounts.map((account) => (
              <li
                key={account.claimId}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <BadgeCheck aria-hidden="true" className="size-6 shrink-0 text-primary" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-start font-medium">
                    <bdi dir="ltr">@{account.handle}</bdi>
                  </span>
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
        </div>
      )}
    </section>
  );
}
