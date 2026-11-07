import { getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { QueryProvider } from '@/components/providers/query-provider';
import { AppShell } from '@/components/shell/app-shell';
import { redirect } from '@/i18n/navigation';
import { currentSession } from '@/lib/session';

export default async function AdminLayout({ children }: LayoutProps<'/[locale]'>) {
  const [session, locale] = await Promise.all([currentSession(), getLocale()]);
  if (session === null) return redirect({ href: '/sign-in', locale });
  if (session.user.role !== 'admin') notFound();
  return (
    <QueryProvider>
      <AppShell role={session.user.role}>{children}</AppShell>
    </QueryProvider>
  );
}
