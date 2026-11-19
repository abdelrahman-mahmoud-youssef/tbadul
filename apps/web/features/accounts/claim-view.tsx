import { linkedAccountsResponse, type Claim } from '@engagement-exchange/contracts';
import { BadgeCheck, CircleSlash, ExternalLink } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/locale-link';
import { localizedPath } from '@/i18n/paths';
import { formatDateTime, formatNumber } from '@/lib/format';
import { serverRequest } from '@/lib/server-api';
import { CancelClaimButton } from './cancel-claim-button';
import { EligibilityReport } from './eligibility-report';
import { LinkSteps } from './link-steps';
import { VerifyPanel } from './verify-panel';

const profileUrl = (handle: string): string =>
  `https://www.tiktok.com/@${encodeURIComponent(handle)}`;

function Handle({ value }: { readonly value: string }) {
  return (
    <bdi dir="ltr" className="font-bold">
      @{value}
    </bdi>
  );
}

async function Receipt({ claim }: { readonly claim: Claim }) {
  const [t, { platforms }] = await Promise.all([
    getTranslations('receipt'),
    serverRequest(linkedAccountsResponse, '/linked-accounts'),
  ]);
  const [tiktok] = platforms;
  const linked = tiktok?.accounts.find((account) => account.claimId === claim.id);
  return (
    <section
      aria-labelledby="receipt-title"
      className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <BadgeCheck aria-hidden="true" className="size-7" />
        </span>
        <div className="flex flex-col">
          <h2 id="receipt-title" className="text-lg font-bold">
            {t('title')}
          </h2>
          <p className="text-muted-foreground">{t('body')}</p>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5 rounded-xl bg-muted p-3">
          <dt className="text-sm text-muted-foreground">{t('account')}</dt>
          <dd>
            <Handle value={claim.handle} />
          </dd>
        </div>
        {claim.verificationAccount !== undefined && (
          <div className="flex flex-col gap-0.5 rounded-xl bg-muted p-3">
            <dt className="text-sm text-muted-foreground">{t('verifiedBy')}</dt>
            <dd>
              <Handle value={claim.verificationAccount.handle} />
            </dd>
          </div>
        )}
        {linked !== undefined && (
          <div className="flex flex-col gap-0.5 rounded-xl bg-muted p-3">
            <dt className="text-sm text-muted-foreground">{t('linkedAt')}</dt>
            <dd className="font-bold">{formatDateTime(linked.linkedAt)}</dd>
          </div>
        )}
        <div className="flex flex-col gap-0.5 rounded-xl bg-muted p-3">
          <dt className="text-sm text-muted-foreground">{t('attempts')}</dt>
          <dd className="font-bold">{formatNumber(claim.attempts.length + 1)}</dd>
        </div>
        {tiktok !== undefined && (
          <div className="flex flex-col gap-0.5 rounded-xl bg-muted p-3">
            <dt className="text-sm text-muted-foreground">{t('slots')}</dt>
            <dd className="font-bold">
              {t('slotsValue', {
                used: formatNumber(tiktok.used),
                limit: formatNumber(tiktok.limit),
              })}
            </dd>
          </div>
        )}
      </dl>
      <LocaleLink href="/accounts" className={buttonVariants({ size: 'lg' })}>
        {t('done')}
      </LocaleLink>
    </section>
  );
}

async function FollowAndVerify({ claim }: { readonly claim: Claim }) {
  const t = await getTranslations('follow');
  const verifier = claim.verificationAccount?.handle ?? '';
  return (
    <>
      <section
        aria-labelledby="follow-title"
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
      >
        <h2 id="follow-title" className="text-lg font-bold">
          {t('title')}
        </h2>
        <p className="leading-[1.8]">
          {t('fromAccount')} <Handle value={claim.handle} /> {t('follow')}{' '}
          <Handle value={verifier} />
          {t('then')}
        </p>
        <a
          href={profileUrl(verifier)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: 'lg', variant: 'outline' })}
        >
          <ExternalLink aria-hidden="true" />
          {t('open')}
        </a>
        <p className="text-sm text-muted-foreground">
          {t('expires', { at: formatDateTime(claim.expiresAt) })}
        </p>
      </section>
      <VerifySection claim={claim} />
    </>
  );
}

async function VerifySection({ claim }: { readonly claim: Claim }) {
  const [t, locale] = await Promise.all([getTranslations('verify'), getLocale()]);
  return (
    <section
      aria-labelledby="verify-title"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="verify-title" className="text-lg font-bold">
          {t('title')}
        </h2>
        <p className="text-muted-foreground">{t('lead')}</p>
      </div>
      <VerifyPanel
        claimId={claim.id}
        nextVerifyAt={claim.nextVerifyAt}
        copy={{
          verify: t('action'),
          pending: t('pending'),
          waitLabel: t('waitLabel'),
          notices: {
            not_following: {
              title: t('notFollowing.title'),
              body: t('notFollowing.body'),
            },
            private: { title: t('private.title'), body: t('private.body') },
            not_found: { title: t('notFound.title'), body: t('notFound.body') },
            source_unavailable: {
              title: t('sourceUnavailable.title'),
              body: t('sourceUnavailable.body'),
            },
            cooldown: { title: t('cooldown.title'), body: t('cooldown.body') },
            rate_limited: {
              title: t('rateLimited.title'),
              body: t('rateLimited.body'),
            },
          },
        }}
      />
      {claim.attempts.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('attempts', { count: formatNumber(claim.attempts.length) })}
        </p>
      )}
      <div className="flex justify-center">
        <CancelClaimButton
          claimId={claim.id}
          label={t('cancel')}
          destination={localizedPath('/accounts', locale)}
        />
      </div>
    </section>
  );
}

async function Closed({ claim }: { readonly claim: Claim }) {
  const t = await getTranslations('closed');
  const reason =
    claim.state === 'eligibility_failed'
      ? t('ineligible')
      : claim.state === 'expired'
        ? t('expired')
        : claim.state === 'cancelled'
          ? t('cancelled')
          : claim.rejection === 'account_already_claimed'
            ? t('alreadyClaimed')
            : t('rejected');
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-input bg-card px-6 py-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <CircleSlash aria-hidden="true" className="size-6" />
      </span>
      <p className="max-w-prose">{reason}</p>
      <LocaleLink href="/accounts/link" className={buttonVariants({ size: 'lg' })}>
        {t('again')}
      </LocaleLink>
    </section>
  );
}

const stepOf = (claim: Claim) => {
  if (claim.state === 'verified') return 'done' as const;
  if (claim.state === 'awaiting_follow') return 'follow' as const;
  return 'eligibility' as const;
};

export async function ClaimView({ claim }: { readonly claim: Claim }) {
  const t = await getTranslations('link');
  return (
    <>
      <p className="text-muted-foreground">
        {t('claimFor')} <Handle value={claim.handle} />
      </p>
      <LinkSteps current={stepOf(claim)} />
      {claim.state === 'verified' ? (
        <Receipt claim={claim} />
      ) : (
        <>
          <EligibilityReport report={claim.eligibility} />
          {claim.state === 'awaiting_follow' ? (
            <FollowAndVerify claim={claim} />
          ) : (
            <Closed claim={claim} />
          )}
        </>
      )}
    </>
  );
}
