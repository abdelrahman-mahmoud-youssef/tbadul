import { describe, expect, it } from 'vitest';
import { failed, type Answer } from '../domain/answer.ts';
import type { SourceError } from '../domain/outcome.ts';
import { fakeSource, hangingUntilAborted, type FakeAnswers } from '../testing/fake-source.ts';
import { followsCheck, likedCheck, listEvidence } from '../testing/fixtures.ts';
import { manualClock } from '../testing/manual-clock.ts';
import { recordingSink } from '../testing/recording-sink.ts';
import { everyKind } from '../testing/orders.ts';
import { verifyWith } from './chain.ts';

const cost = { unit: 'request', amount: 1 } as const;
const verified: Answer<'follows'> = { outcome: 'verified', evidence: listEvidence, cost };
const notFollowing: Answer<'follows'> = { outcome: 'not_following', evidence: listEvidence, cost };
const privateList: Answer<'follows'> = { outcome: 'private', cost };
const notFound: Answer<'follows'> = { outcome: 'not_found', cost };
const timedOut: SourceError = { kind: 'timeout', message: 'slow' };

const chain = (...sources: FakeAnswers[]) => {
  const fakes = sources.map((answers, index) => fakeSource(`s${index}`, answers));
  const clock = manualClock();
  const measurements = recordingSink();
  const verify = verifyWith({
    sources: everyKind(fakes),
    clock,
    measurements,
    pageCap: 3,
    confirmNotFollowing: false,
  });
  return { verify, fakes, clock, measurements };
};

describe('verify', () => {
  it('falls through a source_error to the next source and keeps both attempts', async () => {
    const { verify, measurements } = chain({ follows: failed(timedOut) }, { follows: verified });
    const verdict = await verify(followsCheck);
    expect(verdict).toMatchObject({ outcome: 'verified', evidence: listEvidence, source: 's1' });
    expect(verdict.attempts.map((a) => [a.source, a.outcome])).toEqual([
      ['s0', 'source_error'],
      ['s1', 'verified'],
    ]);
    expect(verdict.attempts[0]?.error).toEqual(timedOut);
    expect(measurements.attempts).toEqual(verdict.attempts);
  });

  it.each([
    ['not_following', notFollowing],
    ['private', privateList],
    ['not_found', notFound],
  ])('stops at the first source that answers %s', async (outcome, answer) => {
    const { verify, fakes } = chain({ follows: answer }, { follows: verified });
    const verdict = await verify(followsCheck);
    expect(verdict).toMatchObject({ outcome, source: 's0' });
    expect(verdict.attempts).toHaveLength(1);
    expect(fakes[1]?.calls).toEqual([]);
  });

  it('answers source_error with every attempt when all sources fail', async () => {
    const { verify } = chain(
      { follows: failed(timedOut) },
      { follows: failed({ kind: 'http', message: 'bad gateway', httpStatus: 502 }) },
    );
    const verdict = await verify(followsCheck);
    expect(verdict.outcome).toBe('source_error');
    expect(verdict.attempts.map((a) => a.error?.kind)).toEqual(['timeout', 'http']);
  });

  it('skips sources that do not support the check kind', async () => {
    const { verify, fakes } = chain({ follows: verified }, { liked: verified });
    const verdict = await verify(likedCheck);
    expect(verdict).toMatchObject({ outcome: 'verified', source: 's1' });
    expect(fakes[0]?.calls).toEqual([]);
    expect(verdict.attempts).toHaveLength(1);
  });

  it('answers source_error with no attempts when no source serves the check', async () => {
    const { verify } = chain({ follows: verified });
    await expect(verify(likedCheck)).resolves.toEqual({
      outcome: 'source_error',
      check: likedCheck,
      attempts: [],
    });
  });

  it('turns a thrown error into a source_error attempt and continues', async () => {
    const { verify } = chain(
      { follows: () => Promise.reject(new Error('boom')) },
      { follows: verified },
    );
    const verdict = await verify(followsCheck);
    expect(verdict.outcome).toBe('verified');
    expect(verdict.attempts[0]?.error).toEqual({ kind: 'unexpected', message: 'boom' });
  });

  it('measures latency and start time with the clock', async () => {
    const started = 1_700_000_000_000;
    const clock = manualClock(started);
    const slow = fakeSource('slow', {
      follows: () => {
        clock.advance(120);
        return Promise.resolve(verified);
      },
    });
    const verify = verifyWith({
      sources: everyKind([slow]),
      clock,
      measurements: recordingSink(),
      pageCap: 3,
      confirmNotFollowing: false,
    });
    const verdict = await verify(followsCheck);
    expect(verdict.attempts[0]).toMatchObject({ startedAt: started, latencyMs: 120, cost });
  });

  it('omits cost and error from an attempt when the answer has none', async () => {
    const { verify } = chain({ follows: failed({ kind: 'network', message: 'down' }) });
    const verdict = await verify(followsCheck);
    expect(verdict.attempts[0]).not.toHaveProperty('cost');
    const { verify: verify2 } = chain({ follows: verified });
    const verdict2 = await verify2(followsCheck);
    expect(verdict2.attempts[0]).not.toHaveProperty('error');
  });

  it('passes the page cap to sources', async () => {
    let seen: number | undefined;
    const { verify } = chain({
      follows: (_check, context) => {
        seen = context.pageCap;
        return Promise.resolve(verified);
      },
    });
    await verify(followsCheck);
    expect(seen).toBe(3);
  });

  it('propagates a cancellation requested by the caller', async () => {
    const { verify } = chain({ follows: hangingUntilAborted }, { follows: verified });
    const controller = new AbortController();
    const pending = verify(followsCheck, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow('aborted');
  });
});

describe('verify with not_following confirmed by a later source', () => {
  const confirming = (...sources: FakeAnswers[]) =>
    verifyWith({
      sources: everyKind(sources.map((answers, index) => fakeSource(`s${index}`, answers))),
      clock: manualClock(),
      measurements: recordingSink(),
      pageCap: 3,
      confirmNotFollowing: true,
    });

  it('answers source_error when the only confirming source cannot match by account id', async () => {
    const verdict = await confirming(
      { follows: notFollowing },
      { follows: failed({ kind: 'unsupported', message: 'no account id in list entries' }) },
    )(followsCheck);
    expect(verdict.outcome).toBe('source_error');
    expect(verdict.attempts.map((a) => [a.source, a.outcome, a.error?.kind])).toEqual([
      ['s0', 'not_following', undefined],
      ['s1', 'source_error', 'unsupported'],
    ]);
  });

  it('settles not_following once a later source confirms it', async () => {
    const verdict = await confirming(
      { follows: notFollowing },
      { follows: failed({ kind: 'unsupported', message: 'no account id in list entries' }) },
      { follows: notFollowing },
    )(followsCheck);
    expect(verdict).toMatchObject({ outcome: 'not_following', source: 's2' });
  });
});
