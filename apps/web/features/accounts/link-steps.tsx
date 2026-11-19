import { Check } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { formatNumber } from '@/lib/format';

const steps = ['account', 'eligibility', 'follow', 'verify'] as const;

export type LinkStep = (typeof steps)[number] | 'done';

export async function LinkSteps({ current }: { readonly current: LinkStep }) {
  const t = await getTranslations('link.steps');
  const labels = {
    account: t('account'),
    eligibility: t('eligibility'),
    follow: t('follow'),
    verify: t('verify'),
  };
  const position = current === 'done' ? steps.length : steps.indexOf(current);
  return (
    <ol aria-label={t('label')} className="grid grid-cols-4 gap-2">
      {steps.map((step, index) => {
        const done = index < position;
        const active = index === position;
        return (
          <li
            key={step}
            aria-current={active ? 'step' : undefined}
            className="flex flex-col items-center gap-1.5 text-center"
          >
            <span
              className={`grid size-8 place-items-center rounded-full text-sm font-bold ${
                done || active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {done ? <Check aria-hidden="true" className="size-4" /> : formatNumber(index + 1)}
            </span>
            <span
              className={`text-xs leading-snug sm:text-sm ${active ? 'font-bold' : 'text-muted-foreground'}`}
            >
              {labels[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
