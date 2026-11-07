'use client';

import { useErrorCopy } from '@/components/states/error-copy';
import { ErrorState } from '@/components/states/error-state';

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorState error={error} retry={reset} copy={useErrorCopy()} />;
}
