import { AppShell } from '@/components/shell/app-shell';
import { currentSession } from '@/lib/session';
import { redirectToSignIn } from '@/lib/sign-in-redirect';

export default async function SignedInLayout({ children }: LayoutProps<'/[locale]'>) {
  const session = await currentSession();
  if (session === null) return redirectToSignIn();
  return <AppShell role={session.user.role}>{children}</AppShell>;
}
