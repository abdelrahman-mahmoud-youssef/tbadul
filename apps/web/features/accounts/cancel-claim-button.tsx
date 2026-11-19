'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

interface CancelClaimButtonProps {
  readonly claimId: string;
  readonly label: string;
  readonly destination: string;
}

export function CancelClaimButton({ claimId, label, destination }: CancelClaimButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const [{ apiRequest }, { claimResponse }] = await Promise.all([
            import('@/lib/api-client'),
            import('@engagement-exchange/contracts'),
          ]);
          await apiRequest(claimResponse, `/claims/${claimId}`, { method: 'DELETE' });
          router.replace(destination);
          router.refresh();
        });
      }}
    >
      {label}
    </Button>
  );
}
