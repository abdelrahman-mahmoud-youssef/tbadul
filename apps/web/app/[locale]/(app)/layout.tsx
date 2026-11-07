import { getLocale } from 'next-intl/server';
import { QueryProvider } from '@/components/providers/query-provider';
import { AppShell } from '@/components/shell/app-shell';
import { redirect } from '@/i18n/navigation';
import { currentSession } from '@/lib/session';

export default async function SignedInLayout({ children }: LayoutProps<'/[locale]'>) {
  const [session, locale] = await Promise.all([currentSession(), getLocale()]);
  if (session === null) return redirect({ href: '/sign-in', locale });
  return (
    <QueryProvider>
      <AppShell role={session.user.role}>{children}</AppShell>
    </QueryProvider>
  );
}
