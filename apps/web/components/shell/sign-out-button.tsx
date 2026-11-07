'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

interface SignOutButtonProps {
  readonly label: string;
  readonly home: string;
}

export function SignOutButton({ label, home }: SignOutButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const { authClient } = await import('@/lib/auth-client');
          await authClient.signOut();
          router.replace(home);
          router.refresh();
        });
      }}
    >
      <LogOut aria-hidden="true" className="rtl:-scale-x-100" />
      <span className="max-md:sr-only">{label}</span>
    </Button>
  );
}
