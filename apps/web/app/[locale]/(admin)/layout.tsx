import { getLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { ErrorCopyProvider } from '@/components/states/error-copy';
import { errorCopy } from '@/components/states/error-copy-server';
import { localizedPath } from '@/i18n/paths';
import { currentSession } from '@/lib/session';

export default async function AdminLayout({ children }: LayoutProps<'/[locale]'>) {
  const [session, locale, copy] = await Promise.all([currentSession(), getLocale(), errorCopy()]);
  if (session === null) redirect(localizedPath('/sign-in', locale));
  if (session.user.role !== 'admin') notFound();
  return (
    <ErrorCopyProvider copy={copy}>
      <AppShell role={session.user.role}>{children}</AppShell>
    </ErrorCopyProvider>
  );
}
