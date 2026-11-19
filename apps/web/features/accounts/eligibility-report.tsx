import type { EligibilityReport as Report } from '@engagement-exchange/contracts';
import { CircleCheck, CircleHelp, CircleX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

const icons = {
  pass: <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-primary" />,
  fail: <CircleX aria-hidden="true" className="size-5 shrink-0 text-destructive" />,
  inconclusive: <CircleHelp aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />,
};

export async function EligibilityReport({ report }: { readonly report: Report }) {
  const t = await getTranslations('eligibility');
  const rules = {
    public_account: t('rules.public_account'),
    following_visible: t('rules.following_visible'),
    min_followers: t('rules.min_followers'),
    min_posts: t('rules.min_posts'),
    recent_activity: t('rules.recent_activity'),
  };
  const results = {
    pass: t('results.pass'),
    fail: t('results.fail'),
    inconclusive: t('results.inconclusive'),
  };
  const reasons = {
    account_private: t('reasons.account_private'),
    following_hidden: t('reasons.following_hidden'),
    following_visibility_unknown: t('reasons.following_visibility_unknown'),
    followers_below_minimum: t('reasons.followers_below_minimum'),
    followers_unknown: t('reasons.followers_unknown'),
    no_posts: t('reasons.no_posts'),
    posts_unknown: t('reasons.posts_unknown'),
    inactive: t('reasons.inactive'),
    activity_unknown: t('reasons.activity_unknown'),
  };
  return (
    <section
      aria-labelledby="eligibility-title"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="eligibility-title" className="text-lg font-bold">
          {t('title')}
        </h2>
        <p className="text-muted-foreground">{report.eligible ? t('eligible') : t('ineligible')}</p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {report.results.map((entry) => (
          <li key={entry.rule} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            {icons[entry.result]}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{rules[entry.rule]}</span>
              {entry.reason !== undefined && (
                <span className="text-sm text-muted-foreground">{reasons[entry.reason]}</span>
              )}
            </span>
            <span className="text-sm font-medium">{results[entry.result]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
