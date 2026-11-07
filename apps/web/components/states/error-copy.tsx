'use client';

import type { ErrorCode } from '@engagement-exchange/contracts';
import { createContext, useContext, type ReactNode } from 'react';

export interface ErrorCopy {
  readonly title: string;
  readonly body: string;
  readonly retry: string;
  readonly codes: Readonly<Record<ErrorCode, string>>;
}

const ErrorCopyContext = createContext<ErrorCopy | null>(null);

export function ErrorCopyProvider({
  copy,
  children,
}: {
  readonly copy: ErrorCopy;
  readonly children: ReactNode;
}) {
  return <ErrorCopyContext value={copy}>{children}</ErrorCopyContext>;
}

export const useErrorCopy = (): ErrorCopy => {
  const copy = useContext(ErrorCopyContext);
  if (copy === null) throw new Error('useErrorCopy needs an ErrorCopyProvider');
  return copy;
};
