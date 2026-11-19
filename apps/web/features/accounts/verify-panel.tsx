'use client';

import { CloudOff, RefreshCw, SearchX, ShieldAlert, Timer, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { useErrorCopy } from '@/components/states/error-copy';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api-error';
import { formatRemaining, useCountdown } from './use-countdown';

type Notice =
  | 'not_following'
  | 'private'
  | 'not_found'
  | 'source_unavailable'
  | 'cooldown'
  | 'rate_limited'
  | 'failed';

interface NoticeCopy {
  readonly title: string;
  readonly body: string;
}

export interface VerifyCopy {
  readonly verify: string;
  readonly pending: string;
  readonly waitLabel: string;
  readonly notices: Readonly<Record<Exclude<Notice, 'failed'>, NoticeCopy>>;
}

interface VerifyPanelProps {
  readonly claimId: string;
  readonly nextVerifyAt: string;
  readonly copy: VerifyCopy;
}

const noticeIcons: Record<Notice, ReactNode> = {
  not_following: <UserX aria-hidden="true" />,
  private: <ShieldAlert aria-hidden="true" />,
  not_found: <SearchX aria-hidden="true" />,
  source_unavailable: <CloudOff aria-hidden="true" />,
  cooldown: <Timer aria-hidden="true" />,
  rate_limited: <Timer aria-hidden="true" />,
  failed: <ShieldAlert aria-hidden="true" />,
};

export function VerifyPanel({ claimId, nextVerifyAt, copy }: VerifyPanelProps) {
  const router = useRouter();
  const errors = useErrorCopy();
  const [notice, setNotice] = useState<{ kind: Notice; text?: string } | null>(null);
  const [readyAt, setReadyAt] = useState(() => Date.parse(nextVerifyAt));
  const [pending, startTransition] = useTransition();
  const remaining = useCountdown(readyAt);
  const waiting = remaining === null || remaining > 0;

  const verify = () => {
    startTransition(async () => {
      const [{ apiRequest }, { verifyClaimResponse }] = await Promise.all([
        import('@/lib/api-client'),
        import('@engagement-exchange/contracts'),
      ]);
      try {
        const result = await apiRequest(verifyClaimResponse, `/claims/${claimId}/verify`, {
          method: 'POST',
        });
        if (result.outcome !== 'verified') {
          setNotice({ kind: result.outcome });
          setReadyAt(Date.parse(result.nextAllowedAt));
        }
        router.refresh();
      } catch (error) {
        if (!(error instanceof ApiRequestError)) {
          setNotice({ kind: 'failed', text: errors.codes.internal });
          return;
        }
        const failure = error.error;
        switch (failure.code) {
          case 'cooldown_active':
            setNotice({ kind: 'cooldown' });
            setReadyAt(Date.now() + failure.details.waitMs);
            return;
          case 'rate_limited':
            setNotice({ kind: 'rate_limited' });
            setReadyAt(Date.now() + failure.details.retryAfterSeconds * 1000);
            return;
          case 'source_unavailable':
            setNotice({ kind: 'source_unavailable' });
            return;
          case 'claim_expired':
          case 'claim_not_verifiable':
            router.refresh();
            return;
          default:
            setNotice({ kind: 'failed', text: errors.codes[failure.code] });
        }
      }
    });
  };

  const shown =
    notice === null
      ? null
      : notice.kind === 'failed'
        ? { title: errors.title, body: notice.text ?? errors.body }
        : copy.notices[notice.kind];

  return (
    <div className="flex flex-col gap-4">
      <div role="status" aria-live="polite" className="empty:hidden">
        {notice !== null && shown !== null && (
          <div
            className={`flex items-start gap-3 rounded-xl border p-4 [&>svg]:size-6 [&>svg]:shrink-0 ${
              notice.kind === 'source_unavailable'
                ? 'border-input bg-secondary text-secondary-foreground'
                : 'border-border bg-muted'
            }`}
          >
            {noticeIcons[notice.kind]}
            <div className="flex flex-col gap-1">
              <p className="font-bold">{shown.title}</p>
              <p>{shown.body}</p>
            </div>
          </div>
        )}
      </div>
      <Button size="lg" onClick={verify} disabled={pending || waiting}>
        {pending ? (
          <>
            <RefreshCw aria-hidden="true" className="motion-safe:animate-spin" />
            {copy.pending}
          </>
        ) : (
          copy.verify
        )}
      </Button>
      {remaining !== null && remaining > 0 && (
        <p className="flex items-center justify-center gap-2 text-muted-foreground">
          <Timer aria-hidden="true" className="size-5" />
          {copy.waitLabel}{' '}
          <span dir="ltr" className="font-bold tabular-nums">
            {formatRemaining(remaining)}
          </span>
        </p>
      )}
    </div>
  );
}
