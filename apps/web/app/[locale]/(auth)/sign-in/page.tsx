import { getLocale, getTranslations } from 'next-intl/server';
import { CredentialsPage } from '@/features/auth/credentials-page';
import { localizedPath } from '@/i18n/paths';
import { destinationOf } from '@/lib/destination';

export default async function SignInPage({ searchParams }: PageProps<'/[locale]/sign-in'>) {
  const [t, locale, { next }] = await Promise.all([
    getTranslations('signIn'),
    getLocale(),
    searchParams,
  ]);
  const destination = destinationOf(next, localizedPath('/accounts', locale));
  return (
    <CredentialsPage
      screen={{
        mode: 'sign-in',
        title: t('title'),
        lead: t('lead'),
        submit: t('submit'),
        switchPrompt: t('switchPrompt'),
        switchLink: t('switchLink'),
        switchTo: '/sign-up',
        destination,
      }}
    />
  );
}
