'use client';

import type { ErrorCode, Platform } from '@engagement-exchange/contracts';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type SubmitEvent } from 'react';
import { useErrorCopy } from '@/components/states/error-copy';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api-error';

export interface LinkStartCopy {
  readonly label: string;
  readonly hint: string;
  readonly submit: string;
  readonly pending: string;
}

interface LinkStartFormProps {
  readonly platform: Platform;
  readonly copy: LinkStartCopy;
  readonly claimPath: string;
}

export function LinkStartForm({ platform, copy, claimPath }: LinkStartFormProps) {
  const router = useRouter();
  const errors = useErrorCopy();
  const id = useId();
  const [failure, setFailure] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('account');
    const account = typeof value === 'string' ? value : '';
    startTransition(async () => {
      const [{ apiRequest }, { claimResponse }] = await Promise.all([
        import('@/lib/api-client'),
        import('@engagement-exchange/contracts'),
      ]);
      try {
        const { claim } = await apiRequest(claimResponse, '/claims', {
          method: 'POST',
          body: { platform, account },
        });
        router.push(`${claimPath}/${claim.id}`);
      } catch (error) {
        if (!(error instanceof ApiRequestError)) {
          setFailure('internal');
          return;
        }
        if (error.error.code === 'eligibility_failed') {
          router.push(`${claimPath}/${error.error.details.claimId}`);
          return;
        }
        setFailure(error.error.code);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-account`} className="font-medium">
          {copy.label}
        </label>
        <input
          id={`${id}-account`}
          name="account"
          dir="ltr"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={200}
          placeholder="@username"
          aria-describedby={`${id}-hint ${id}-failure`}
          aria-invalid={failure !== null}
          className="min-h-touch w-full rounded-lg border border-input bg-card px-3 text-start text-base text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {copy.hint}
        </p>
      </div>
      <p id={`${id}-failure`} role="alert" className="text-destructive empty:hidden">
        {failure === null ? '' : errors.codes[failure]}
      </p>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? copy.pending : copy.submit}
      </Button>
    </form>
  );
}
