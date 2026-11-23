'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';

export type CredentialsMode = 'sign-in' | 'sign-up';

export type CredentialsFailure =
  | 'invalidCredentials'
  | 'emailTaken'
  | 'passwordTooShort'
  | 'passwordMismatch'
  | 'rateLimited'
  | 'unknown';

export interface CredentialsCopy {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly passwordHint: string;
  readonly confirmPassword: string;
  readonly submit: string;
  readonly pending: string;
  readonly failures: Readonly<Record<CredentialsFailure, string>>;
}

interface CredentialsFormProps {
  readonly mode: CredentialsMode;
  readonly copy: CredentialsCopy;
  readonly destination: string;
}

const minPasswordLength = 8;

const failureOf = (error: { code?: string | undefined; status: number }): CredentialsFailure => {
  if (error.status === 429) return 'rateLimited';
  if (error.code === 'INVALID_EMAIL_OR_PASSWORD') return 'invalidCredentials';
  if (error.code?.startsWith('USER_ALREADY_EXISTS') === true) return 'emailTaken';
  if (error.code === 'PASSWORD_TOO_SHORT') return 'passwordTooShort';
  return 'unknown';
};

const text = (fields: FormData, name: string): string => {
  const value = fields.get(name);
  return typeof value === 'string' ? value : '';
};

const fieldClass =
  'min-h-touch w-full rounded-lg border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive';

export function CredentialsForm({ mode, copy, destination }: CredentialsFormProps) {
  const router = useRouter();
  const id = useId();
  const [failure, setFailure] = useState<CredentialsFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const failureId = `${id}-failure`;
  const hintId = `${id}-hint`;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = text(fields, 'email');
    const password = text(fields, 'password');
    if (mode === 'sign-up' && password !== text(fields, 'confirmPassword')) {
      setFailure('passwordMismatch');
      return;
    }
    startTransition(async () => {
      const { authClient } = await import('@/lib/auth-client');
      const { error } =
        mode === 'sign-in'
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: text(fields, 'name') });
      if (error !== null) {
        setFailure(failureOf(error));
        return;
      }
      router.replace(destination);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={submit}
      aria-describedby={failure === null ? undefined : failureId}
      className="flex flex-col gap-5"
    >
      {mode === 'sign-up' && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-name`} className="font-medium">
            {copy.name}
          </label>
          <input
            id={`${id}-name`}
            name="name"
            autoComplete="name"
            required
            className={fieldClass}
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-email`} className="font-medium">
          {copy.email}
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          required
          aria-invalid={failure === 'invalidCredentials' || failure === 'emailTaken'}
          className={`${fieldClass} text-start`}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-password`} className="font-medium">
          {copy.password}
        </label>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          dir="ltr"
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          minLength={mode === 'sign-up' ? minPasswordLength : undefined}
          required
          aria-describedby={mode === 'sign-up' ? hintId : undefined}
          aria-invalid={failure === 'invalidCredentials' || failure === 'passwordTooShort'}
          className={`${fieldClass} text-start`}
        />
        {mode === 'sign-up' && (
          <p id={hintId} className="text-sm text-muted-foreground">
            {copy.passwordHint}
          </p>
        )}
      </div>
      {mode === 'sign-up' && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-confirm`} className="font-medium">
            {copy.confirmPassword}
          </label>
          <input
            id={`${id}-confirm`}
            name="confirmPassword"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            required
            aria-invalid={failure === 'passwordMismatch'}
            className={`${fieldClass} text-start`}
          />
        </div>
      )}
      <p
        id={failureId}
        role="alert"
        className="min-h-[1.7em] rounded-lg text-destructive empty:min-h-0"
      >
        {failure === null ? '' : copy.failures[failure]}
      </p>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? copy.pending : copy.submit}
      </Button>
    </form>
  );
}
