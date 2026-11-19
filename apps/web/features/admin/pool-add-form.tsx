'use client';

import type { ErrorCode, PoolAddition } from '@engagement-exchange/contracts';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type SubmitEvent } from 'react';
import { useErrorCopy } from '@/components/states/error-copy';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api-error';

export interface PoolAddCopy {
  readonly label: string;
  readonly hint: string;
  readonly submit: string;
  readonly pending: string;
  readonly statuses: Readonly<Record<PoolAddition, string>>;
}

type Feedback = { kind: 'added'; status: PoolAddition } | { kind: 'failed'; code: ErrorCode };

export function PoolAddForm({ copy }: { readonly copy: PoolAddCopy }) {
  const router = useRouter();
  const errors = useErrorCopy();
  const id = useId();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = new FormData(form).get('account');
    const account = typeof value === 'string' ? value : '';
    startTransition(async () => {
      const [{ apiRequest }, { addPoolAccountResponse }] = await Promise.all([
        import('@/lib/api-client'),
        import('@engagement-exchange/contracts'),
      ]);
      try {
        const added = await apiRequest(addPoolAccountResponse, '/admin/pool', {
          method: 'POST',
          body: { platform: 'tiktok', account },
        });
        setFeedback({ kind: 'added', status: added.status });
        form.reset();
        router.refresh();
      } catch (error) {
        setFeedback({
          kind: 'failed',
          code: error instanceof ApiRequestError ? error.error.code : 'internal',
        });
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
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
          aria-describedby={`${id}-hint`}
          aria-invalid={feedback?.kind === 'failed'}
          className="min-h-touch w-full rounded-lg border border-input bg-card px-3 text-start text-base text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {copy.hint}
        </p>
      </div>
      <p
        role="status"
        className={`empty:hidden ${feedback?.kind === 'failed' ? 'text-destructive' : 'text-primary'}`}
      >
        {feedback === null
          ? ''
          : feedback.kind === 'added'
            ? copy.statuses[feedback.status]
            : errors.codes[feedback.code]}
      </p>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? copy.pending : copy.submit}
      </Button>
    </form>
  );
}
