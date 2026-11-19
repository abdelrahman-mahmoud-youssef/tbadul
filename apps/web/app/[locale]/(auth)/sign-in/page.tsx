import { getTranslations } from 'next-intl/server';
import { CredentialsPage } from '@/features/auth/credentials-page';

export default async function SignInPage() {
  const t = await getTranslations('signIn');
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
      }}
    />
  );
}
