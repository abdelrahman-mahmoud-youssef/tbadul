import { getTranslations } from 'next-intl/server';
import { upcomingPlatforms } from '@/lib/platforms';
import { PlatformIcon } from './platform-icon';

interface UpcomingPlatformsProps {
  readonly title: string;
  readonly body?: string;
}

export async function UpcomingPlatforms({ title, body }: UpcomingPlatformsProps) {
  const t = await getTranslations('platforms');
  return (
    <section aria-labelledby="upcoming-platforms" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="upcoming-platforms" className="text-lg font-bold">
          {title}
        </h2>
        {body === undefined ? null : <p className="text-muted-foreground">{body}</p>}
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {upcomingPlatforms.map((id) => (
          <li
            key={id}
            className="flex items-center gap-3 rounded-2xl border border-dashed border-input bg-card p-4"
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
