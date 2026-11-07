import type { UserRole } from '@engagement-exchange/contracts';
import { ShieldCheck, UserRound } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/brand/wordmark';
import { ThemeSwitch } from '@/components/theme/theme-switch';
import { localizedPath } from '@/i18n/paths';
import { NavLink } from './nav-link';
import { SignOutButton } from './sign-out-button';

interface AppShellProps {
  readonly role: UserRole;
  readonly children: ReactNode;
}

export async function AppShell({ role, children }: AppShellProps) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return (
    <div className="min-h-dvh lg:flex">
      <nav
        aria-label={t('nav.label')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:sticky lg:top-0 lg:h-dvh lg:w-28 lg:shrink-0 lg:border-t-0 lg:border-e lg:pt-24 lg:pb-0"
      >
        <ul className="flex justify-center gap-2 px-4 py-1.5 lg:flex-col lg:items-center lg:px-2">
          <li>
            <NavLink
              href={localizedPath('/accounts', locale)}
              segment="accounts"
              icon={<UserRound aria-hidden="true" />}
              label={t('nav.accounts')}
            />
          </li>
          {role === 'admin' ? (
            <li>
              <NavLink
                href={localizedPath('/admin', locale)}
                segment="admin"
                icon={<ShieldCheck aria-hidden="true" />}
                label={t('nav.admin')}
              />
            </li>
          ) : null}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 pt-[env(safe-area-inset-top)] lg:px-8">
          <div className="flex h-16 items-center">
            <Wordmark />
          </div>
          <div className="flex items-center gap-1">
            <ThemeSwitch />
            <SignOutButton label={t('auth.signOut')} home={localizedPath('/', locale)} />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 pb-28 md:px-8 lg:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
