'use client';

import { CloudOff, RefreshCw, SearchX, ShieldAlert, Timer, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { useErrorCopy } from '@/components/states/error-copy';
import { Button } from '@/components/ui/button';
import { ApiRequestError, isTimeout } from '@/lib/api-error';
import { formatDateTime } from '@/lib/format';
import { formatRemaining, useCooldown } from './use-cooldown';
import { useSlowHint } from './use-slow-hint';

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
  readonly slow: string;
  readonly waitLabel: string;
  readonly nextAtLabel: string;
  readonly notices: Readonly<Record<Exclude<Notice, 'failed'>, NoticeCopy>>;
}

interface VerifyPanelProps {
  readonly claimId: string;
  readonly waitMs: number;
  readonly copy: VerifyCopy;
}

const slowAfterMs = 4000;

const noticeIcons: Record<Notice, ReactNode> = {
  not_following: <UserX aria-hidden="true" />,
  private: <ShieldAlert aria-hidden="true" />,
  not_found: <SearchX aria-hidden="true" />,
  source_unavailable: <CloudOff aria-hidden="true" />,
  cooldown: <Timer aria-hidden="true" />,
  rate_limited: <Timer aria-hidden="true" />,
  failed: <ShieldAlert aria-hidden="true" />,
};

export function VerifyPanel({ claimId, waitMs, copy }: VerifyPanelProps) {
  const router = useRouter();
  const errors = useErrorCopy();
  const [notice, setNotice] = useState<{ kind: Notice; text?: string } | null>(null);
  const [finished, setFinished] = useState(false);
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const cooldown = useCooldown(waitMs);
  const slow = useSlowHint(pending, slowAfterMs);
  const { remaining, total, endsAt } = cooldown;
  const waiting = remaining === null || remaining > 0;
  const busy = pending || refreshing || finished;
  const progress = remaining === null || total === 0 ? 0 : 1 - remaining / total;

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      startRefresh(() => {
        router.refresh();
      });
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [router]);

  const verify = () => {
    startTransition(async () => {
      const [{ apiRequest, slowCallTimeoutMs }, { verifyClaimResponse }] = await Promise.all([
        import('@/lib/api-client'),
        import('@engagement-exchange/contracts'),
      ]);
      let serverOffset = 0;
      try {
        const result = await apiRequest(verifyClaimResponse, `/claims/${claimId}/verify`, {
          method: 'POST',
          timeoutMs: slowCallTimeoutMs,
          onServerTime: (serverMs) => {
            serverOffset = serverMs - Date.now();
          },
        });
        if (result.outcome === 'verified') {
          setFinished(true);
        } else {
          setNotice({ kind: result.outcome });
          cooldown.start(
            Math.max(0, Date.parse(result.nextAllowedAt) - (Date.now() + serverOffset)),
          );
        }
        startRefresh(() => {
          router.refresh();
        });
      } catch (error) {
        if (!(error instanceof ApiRequestError)) {
          setNotice(
            isTimeout(error)
              ? { kind: 'source_unavailable' }
              : { kind: 'failed', text: errors.codes.internal },
          );
          return;
        }
        const failure = error.error;
        switch (failure.code) {
          case 'cooldown_active':
            setNotice({ kind: 'cooldown' });
            cooldown.start(failure.details.waitMs);
            return;
          case 'rate_limited':
            setNotice({ kind: 'rate_limited' });
            cooldown.start(failure.details.retryAfterSeconds * 1000);
            return;
          case 'source_unavailable':
            setNotice({ kind: 'source_unavailable' });
            return;
          case 'claim_expired':
          case 'claim_not_verifiable':
            startRefresh(() => {
              router.refresh();
            });
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
      <Button size="lg" onClick={verify} disabled={busy || waiting} aria-busy={busy}>
        {busy ? (
          <>
            <RefreshCw aria-hidden="true" className="motion-safe:animate-spin" />
            {copy.pending}
          </>
        ) : (
          copy.verify
        )}
      </Button>
      <p role="status" className="text-center text-sm text-muted-foreground empty:hidden">
        {slow ? copy.slow : ''}
      </p>
      {remaining !== null && remaining > 0 && !busy && (
        <div className="flex flex-col gap-2">
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-linear motion-reduce:transition-none"
              style={{ width: `${String(Math.round(progress * 100))}%` }}
            />
          </div>
          <p className="flex items-center justify-center gap-2 text-muted-foreground">
            <Timer aria-hidden="true" className="size-5" />
            {copy.waitLabel}{' '}
            <span dir="ltr" className="font-bold tabular-nums">
              {formatRemaining(remaining)}
            </span>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            {copy.nextAtLabel}{' '}
            <span className="tabular-nums">{formatDateTime(new Date(endsAt))}</span>
          </p>
        </div>
      )}
    </div>
  );
}
