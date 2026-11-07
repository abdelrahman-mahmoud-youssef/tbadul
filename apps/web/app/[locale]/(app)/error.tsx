'use client';

import { ErrorState } from '@/components/states/error-state';

export default function SignedInError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorState error={error} retry={reset} />;
}
