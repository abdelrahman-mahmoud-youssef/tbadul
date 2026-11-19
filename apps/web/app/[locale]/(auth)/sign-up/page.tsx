import { getTranslations } from 'next-intl/server';
import { CredentialsPage } from '@/features/auth/credentials-page';

export default async function SignUpPage() {
  const t = await getTranslations('signUp');
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
      }}
    />
  );
}
