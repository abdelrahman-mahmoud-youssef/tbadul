import { getLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { localizedPath } from '@/i18n/paths';
import { currentSession } from '@/lib/session';

export default async function AdminLayout({ children }: LayoutProps<'/[locale]'>) {
  const [session, locale] = await Promise.all([currentSession(), getLocale()]);
  if (session === null) redirect(localizedPath('/sign-in', locale));
  if (session.user.role !== 'admin') notFound();
  return <AppShell role={session.user.role}>{children}</AppShell>;
}
