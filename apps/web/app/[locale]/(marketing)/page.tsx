import { BadgeCheck, Link2, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BrandMark } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/lib/format';

const steps = [
  { key: 'link', icon: Link2 },
  { key: 'follow', icon: UserPlus },
  { key: 'verify', icon: BadgeCheck },
] as const;

export default function LandingPage() {
  const t = useTranslations();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-4 pt-8 pb-16 md:px-8 lg:gap-24 lg:pt-16">
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="flex flex-col items-start gap-6">
          <h1 className="text-[2.25rem] leading-[1.35] font-bold text-balance md:text-5xl md:leading-[1.3] xl:text-6xl">
            {t('landing.headline')}
          </h1>
          <p className="max-w-[34rem] text-lg leading-[1.8] text-muted-foreground">
            {t('landing.lead')}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">{t('auth.signUp')}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">{t('auth.signIn')}</Link>
            </Button>
          </div>
        </div>
        <div className="relative mx-auto hidden aspect-square w-full max-w-sm place-items-center md:grid">
          <div className="absolute inset-0 rounded-full bg-secondary" />
          <div className="absolute inset-[18%] rounded-full border-2 border-dashed border-primary/40" />
          <BrandMark className="relative size-1/2 text-primary" />
        </div>
      </section>
      <section aria-labelledby="steps-title" className="flex flex-col gap-6">
        <h2 id="steps-title" className="text-2xl font-bold md:text-3xl">
          {t('landing.stepsTitle')}
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map(({ key, icon: Icon }, index) => (
            <li key={key} className="@container rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-col gap-3 @xs:flex-row @xs:items-start @xs:gap-4">
                <div className="flex items-center gap-2">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                    {formatNumber(index + 1)}
                  </span>
                  <Icon aria-hidden="true" className="size-6 text-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-bold">{t(`landing.steps.${key}.title`)}</h3>
                  <p className="text-muted-foreground">{t(`landing.steps.${key}.body`)}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
