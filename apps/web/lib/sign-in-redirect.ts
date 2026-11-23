import { getLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { localizedPath } from '@/i18n/paths';

export const redirectToSignIn = async (): Promise<never> => {
  const [locale, requested] = await Promise.all([
    getLocale(),
    headers().then((list) => list.get('x-request-path')),
  ]);
  const signIn = localizedPath('/sign-in', locale);
  return redirect(
    requested === null ? signIn : `${signIn}?${new URLSearchParams({ next: requested })}`,
  );
};
