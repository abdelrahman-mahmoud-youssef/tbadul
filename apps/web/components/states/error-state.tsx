import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api-error';
import type { ErrorCopy } from './error-copy';

interface ErrorStateProps {
  readonly error: Error;
  readonly retry: () => void;
  readonly copy: ErrorCopy;
}

export function ErrorState({ error, retry, copy }: ErrorStateProps) {
  return (
    <section
      role="alert"
      className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center"
    >
      <div className="grid size-14 place-items-center rounded-full bg-muted text-destructive [&_svg]:size-7">
        <TriangleAlert aria-hidden="true" />
      </div>
      <div className="flex max-w-prose flex-col gap-1">
        <h2 className="text-lg font-bold">{copy.title}</h2>
        <p className="text-muted-foreground">
          {error instanceof ApiRequestError ? copy.codes[error.error.code] : copy.body}
        </p>
      </div>
      <Button variant="outline" onClick={retry}>
        {copy.retry}
      </Button>
    </section>
  );
}
