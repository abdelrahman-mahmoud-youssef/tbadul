'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

export interface RemoveLinkedCopy {
  readonly remove: string;
  readonly confirm: string;
  readonly keep: string;
  readonly failed: string;
}

interface RemoveLinkedButtonProps {
  readonly claimId: string;
  readonly handle: string;
  readonly copy: RemoveLinkedCopy;
}

export function RemoveLinkedButton({ claimId, handle, copy }: RemoveLinkedButtonProps) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    startTransition(async () => {
      const [{ apiRequest }, { claimResponse }] = await Promise.all([
        import('@/lib/api-client'),
        import('@engagement-exchange/contracts'),
      ]);
      try {
        await apiRequest(claimResponse, `/linked-accounts/${claimId}`, { method: 'DELETE' });
      } catch {
        setFailed(true);
        return;
      }
      router.refresh();
    });
  };

  if (!asking) {
    return (
      <Button
        variant="ghost"
        onClick={() => {
          setAsking(true);
        }}
        aria-label={`${copy.remove} @${handle}`}
      >
        {copy.remove}
      </Button>
    );
  }
  return (
    <span className="flex flex-col items-end gap-2">
      <span className="flex gap-2">
        <Button variant="outline" disabled={pending} onClick={remove}>
          {copy.confirm}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setAsking(false);
            setFailed(false);
          }}
        >
          {copy.keep}
        </Button>
      </span>
      {failed && (
        <span role="alert" className="text-sm text-destructive">
          {copy.failed}
        </span>
      )}
    </span>
  );
}
