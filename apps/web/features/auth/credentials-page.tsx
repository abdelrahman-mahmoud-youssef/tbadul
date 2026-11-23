import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shell/page-header';
import { LocaleLink } from '@/i18n/locale-link';
import type { AppPath } from '@/i18n/paths';
import { CredentialsForm, type CredentialsMode } from './credentials-form';

export interface CredentialsScreen {
  readonly mode: CredentialsMode;
  readonly title: string;
  readonly lead: string;
  readonly submit: string;
  readonly switchPrompt: string;
  readonly switchLink: string;
  readonly switchTo: AppPath;
  readonly destination: string;
}

export async function CredentialsPage({ screen }: { readonly screen: CredentialsScreen }) {
  const t = await getTranslations('credentials');
  return (
    <>
      <div className="flex flex-col gap-2">
        <PageHeader title={screen.title} />
        <p className="text-muted-foreground">{screen.lead}</p>
      </div>
      <CredentialsForm
        mode={screen.mode}
        destination={screen.destination}
        copy={{
          name: t('name'),
          email: t('email'),
          password: t('password'),
          passwordHint: t('passwordHint'),
          confirmPassword: t('confirmPassword'),
          submit: screen.submit,
          pending: t('pending'),
          failures: {
            invalidCredentials: t('failures.invalidCredentials'),
            emailTaken: t('failures.emailTaken'),
            passwordTooShort: t('failures.passwordTooShort'),
            passwordMismatch: t('failures.passwordMismatch'),
            rateLimited: t('failures.rateLimited'),
            unknown: t('failures.unknown'),
          },
        }}
      />
      <p className="text-muted-foreground">
        {screen.switchPrompt}{' '}
        <LocaleLink
          href={screen.switchTo}
          className="inline-flex min-h-touch items-center font-medium text-primary underline underline-offset-4"
        >
          {screen.switchLink}
        </LocaleLink>
      </p>
    </>
  );
}
