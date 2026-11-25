import { getTranslations } from 'next-intl/server';
import { PlatformIcon } from '@/components/platform/platform-icon';
import { LocaleLink } from '@/i18n/locale-link';
import { livePlatforms, upcomingPlatforms, type PlatformId } from '@/lib/platforms';

interface PlatformPickerProps {
  readonly selected: PlatformId;
  readonly title: string;
}

export async function PlatformPicker({ selected, title }: PlatformPickerProps) {
  const t = await getTranslations('platforms');
  return (
    <section aria-labelledby="platform-picker" className="flex flex-col gap-3">
      <h2 id="platform-picker" className="font-bold">
        {title}
      </h2>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {livePlatforms.map((id) => (
          <li key={id}>
            <LocaleLink
              href={`/accounts/link?platform=${id}`}
              aria-current={id === selected ? 'true' : undefined}
              className={`flex min-h-touch items-center gap-3 rounded-2xl border p-4 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                id === selected
                  ? 'border-primary bg-secondary'
                  : 'border-border bg-card hover:bg-muted'
              }`}
            >
              <PlatformIcon id={id} />
              <span className="font-medium">{t(`${id}.name`)}</span>
            </LocaleLink>
          </li>
        ))}
        {upcomingPlatforms.map((id) => (
          <li
            key={id}
            className="flex min-h-touch items-center gap-3 rounded-2xl border border-dashed border-input bg-card p-4"
          >
            <PlatformIcon id={id} muted />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{t(`${id}.name`)}</span>
              <span className="text-sm text-muted-foreground">{t('soon')}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
