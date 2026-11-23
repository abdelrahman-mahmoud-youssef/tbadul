import { getLocale, getTranslations } from 'next-intl/server';
import { CredentialsPage } from '@/features/auth/credentials-page';
import { localizedPath } from '@/i18n/paths';
import { destinationOf } from '@/lib/destination';

export default async function SignUpPage({ searchParams }: PageProps<'/[locale]/sign-up'>) {
  const [t, locale, { next }] = await Promise.all([
    getTranslations('signUp'),
    getLocale(),
    searchParams,
  ]);
  const destination = destinationOf(next, localizedPath('/accounts', locale));
  return (
    <CredentialsPage
      screen={{
        mode: 'sign-up',
        title: t('title'),
        lead: t('lead'),
        submit: t('submit'),
        switchPrompt: t('switchPrompt'),
        switchLink: t('switchLink'),
        switchTo: '/sign-in',
        destination,
      }}
    />
  );
}
