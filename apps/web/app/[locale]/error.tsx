'use client';

import { useErrorCopy } from '@/components/states/error-copy';
import { ErrorState } from '@/components/states/error-state';

export default function LocaleError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-16">
      <ErrorState error={error} retry={reset} copy={useErrorCopy()} />
    </main>
  );
}
