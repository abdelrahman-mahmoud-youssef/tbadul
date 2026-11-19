'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

interface PoolToggleProps {
  readonly accountId: string;
  readonly active: boolean;
  readonly label: string;
}

export function PoolToggle({ accountId, active, label }: PoolToggleProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const [{ apiRequest }, { poolAccountResponse }] = await Promise.all([
            import('@/lib/api-client'),
            import('@engagement-exchange/contracts'),
          ]);
          await apiRequest(poolAccountResponse, `/admin/pool/${encodeURIComponent(accountId)}`, {
            method: 'PATCH',
            body: { platform: 'tiktok', active: !active },
          });
          router.refresh();
        });
      }}
    >
      {label}
    </Button>
  );
}
