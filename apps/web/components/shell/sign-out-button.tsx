'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';

export function SignOutButton() {
  const t = useTranslations('auth');
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
          router.replace('/');
          router.refresh();
        });
      }}
    >
      <LogOut aria-hidden="true" />
      <span className="max-md:sr-only">{t('signOut')}</span>
    </Button>
  );
}
