import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Answer } from '../../domain/answer.ts';
import type { CallContext } from '../../ports/verification-source.ts';
import { fakeSource, hangingUntilAborted, neverSettling } from '../../testing/fake-source.ts';
import { context, followsCheck, listEvidence } from '../../testing/fixtures.ts';
import { withTimeout } from './with-timeout.ts';

const verified: Answer<'follows'> = {
  outcome: 'verified',
  evidence: listEvidence,
  cost: { unit: 'request', amount: 1 },
};

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the identity and supported kinds of the wrapped source', () => {
    const source = fakeSource('fake', { follows: verified });
    const wrapped = withTimeout(source, 1000);
    expect(wrapped.name).toBe('fake');
    expect(wrapped.platform).toBe('tiktok');
    expect(wrapped.supports).toBe(source.supports);
  });

  it('passes a prompt answer through unchanged', async () => {
    const wrapped = withTimeout(fakeSource('fake', { follows: verified }), 1000);
    await expect(wrapped.answer(followsCheck, context())).resolves.toEqual(verified);
  });

  it('answers source_error with kind timeout when the source never settles', async () => {
    const wrapped = withTimeout(fakeSource('fake', { follows: neverSettling }), 1000);
    const pending = wrapped.answer(followsCheck, context());
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({
      outcome: 'source_error',
      error: { kind: 'timeout', message: 'fake exceeded 1000 ms' },
    });
  });

  it('aborts the signal handed to the source when the timeout fires', async () => {
    let received: CallContext | undefined;
    const wrapped = withTimeout(
      fakeSource('fake', {
        follows: (check, ctx) => {
          received = ctx;
          return hangingUntilAborted(check, ctx);
        },
      }),
      500,
    );
    const pending = wrapped.answer(followsCheck, context({ pageCap: 7 }));
    expect(received?.signal.aborted).toBe(false);
    expect(received?.pageCap).toBe(7);
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    expect(received?.signal.aborted).toBe(true);
  });

  it('does not report a timeout before the duration has passed', async () => {
    const wrapped = withTimeout(fakeSource('fake', { follows: neverSettling }), 1000);
    let settled = false;
    const pending = wrapped.answer(followsCheck, context()).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
  });

  it('propagates a cancellation requested by the caller instead of reporting a timeout', async () => {
    const wrapped = withTimeout(fakeSource('fake', { follows: hangingUntilAborted }), 1000);
    const controller = new AbortController();
    const pending = wrapped.answer(followsCheck, context({ signal: controller.signal }));
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
