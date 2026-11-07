import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVerifier } from './create-verifier.ts';
import { failed, type Answer } from './domain/answer.ts';
import { fakeSource, neverSettling } from './testing/fake-source.ts';
import {
  followsCheck,
  listEvidence,
  performer,
  profileEvidence,
  token,
} from './testing/fixtures.ts';
import { manualClock } from './testing/manual-clock.ts';
import { sameOrder } from './testing/orders.ts';
import { recordingSink } from './testing/recording-sink.ts';

const cost = { unit: 'request', amount: 1 } as const;
const verified: Answer<'follows'> = { outcome: 'verified', evidence: listEvidence, cost };
const config = { order: sameOrder(['lamatok', 'scraper']), timeoutMs: 1000, pageCap: 3 };

describe('createVerifier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('consults sources in the configured order, not the order they were passed in', async () => {
    const scraper = fakeSource('scraper', { follows: verified });
    const lamatok = fakeSource('lamatok', { follows: verified });
    const verifier = createVerifier(config, { sources: [scraper, lamatok] });
    const verdict = await verifier.verify(followsCheck);
    expect(verdict).toMatchObject({ outcome: 'verified', source: 'lamatok' });
    expect(scraper.calls).toEqual([]);
  });

  it('walks the order of the check kind and never asks a source listed for another kind', async () => {
    const paid = fakeSource('lamatok', {
      profile: { outcome: 'verified', evidence: profileEvidence('bio'), cost },
      follows: verified,
    });
    const scraper = fakeSource('scraper', {
      profile: { outcome: 'verified', evidence: profileEvidence('bio'), cost },
      follows: verified,
    });
    const verifier = createVerifier(
      {
        order: { profile: ['lamatok', 'scraper'], follows: ['scraper'], liked: ['scraper'] },
        timeoutMs: 1000,
        pageCap: 3,
      },
      { sources: [scraper, paid] },
    );
    await expect(verifier.verify({ kind: 'profile', subject: performer })).resolves.toMatchObject({
      source: 'lamatok',
    });
    await expect(verifier.verify(followsCheck)).resolves.toMatchObject({ source: 'scraper' });
    expect(paid.calls.map((check) => check.kind)).toEqual(['profile']);
    expect(scraper.calls.map((check) => check.kind)).toEqual(['follows']);
  });

  it('rejects an unknown name in any kind', () => {
    const sources = [fakeSource('lamatok', {}), fakeSource('scraper', {})];
    expect(() =>
      createVerifier({ ...config, order: { ...config.order, liked: ['ensemble'] } }, { sources }),
    ).toThrow('unknown verification source: ensemble');
  });

  it('rejects a budget for a source that was not provided', () => {
    const sources = [fakeSource('lamatok', {}), fakeSource('scraper', {})];
    expect(() =>
      createVerifier(
        { ...config, budgets: { ensemble: { unit: 'units', daily: 100 } } },
        { sources },
      ),
    ).toThrow('budget for unknown source: ensemble');
  });

  it('skips a source at its daily budget and falls through to the next', async () => {
    const reached: string[] = [];
    const { verify } = createVerifier(
      { ...config, budgets: { lamatok: { unit: 'request', daily: 1 } } },
      {
        sources: [
          fakeSource('lamatok', { follows: verified }),
          fakeSource('scraper', { follows: verified }),
        ],
        spendLedger: { spentSince: () => Promise.resolve(1) },
        onBudgetReached: (source) => reached.push(source),
      },
    );

    const verdict = await verify(followsCheck);

    expect(verdict).toMatchObject({ outcome: 'verified', source: 'scraper' });
    expect(verdict.attempts[0]).toMatchObject({ source: 'lamatok', error: { kind: 'budget' } });
    expect(reached).toEqual(['lamatok']);
  });

  it('rejects an order that names a source that was not provided', () => {
    expect(() =>
      createVerifier(config, { sources: [fakeSource('scraper', { follows: verified })] }),
    ).toThrow('unknown verification source: lamatok');
  });

  it.each([
    ['empty order', { ...config, order: { ...config.order, liked: [] } }],
    ['duplicate names', { ...config, order: { ...config.order, follows: ['lamatok', 'lamatok'] } }],
    ['zero timeout', { ...config, timeoutMs: 0 }],
    ['fractional page cap', { ...config, pageCap: 1.5 }],
    ['zero handle ttl', { ...config, cache: { handleTtlMs: 0 } }],
    ['fractional stats ttl', { ...config, cache: { statsTtlMs: 0.5 } }],
  ])('rejects a config with %s', (_label, invalid) => {
    const sources = [fakeSource('lamatok', {}), fakeSource('scraper', {})];
    expect(() => createVerifier(invalid, { sources })).toThrow();
  });

  it('applies the timeout to every source', async () => {
    const lamatok = fakeSource('lamatok', { follows: neverSettling });
    const scraper = fakeSource('scraper', { follows: verified });
    const measurements = recordingSink();
    const verifier = createVerifier(config, {
      sources: [lamatok, scraper],
      clock: manualClock(),
      measurements,
    });
    const pending = verifier.verify(followsCheck);
    await vi.advanceTimersByTimeAsync(1000);
    const verdict = await pending;
    expect(verdict).toMatchObject({ outcome: 'verified', source: 'scraper' });
    expect(measurements.attempts.map((a) => [a.source, a.outcome, a.error?.kind])).toEqual([
      ['lamatok', 'source_error', 'timeout'],
      ['scraper', 'verified', undefined],
    ]);
  });

  it('passes the page cap to sources', async () => {
    let seen: number | undefined;
    const lamatok = fakeSource('lamatok', {
      follows: (_check, context) => {
        seen = context.pageCap;
        return Promise.resolve(verified);
      },
    });
    const verifier = createVerifier(config, { sources: [lamatok, fakeSource('scraper', {})] });
    await verifier.verify(followsCheck);
    expect(seen).toBe(3);
  });

  it('measures with the system clock when none is given', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const lamatok = fakeSource('lamatok', {
      follows: failed({ kind: 'network', message: 'down' }),
    });
    const verifier = createVerifier(config, { sources: [lamatok, fakeSource('scraper', {})] });
    const verdict = await verifier.verify(followsCheck);
    expect(verdict.attempts[0]).toMatchObject({ startedAt: Date.UTC(2026, 0, 1), latencyMs: 0 });
  });

  it('exposes the ownership use case over the same chain', async () => {
    const lamatok = fakeSource('lamatok', {
      profile: { outcome: 'verified', evidence: profileEvidence('hi EX-1 there'), cost },
    });
    const verifier = createVerifier(config, { sources: [lamatok, fakeSource('scraper', {})] });
    const verdict = await verifier.verifyOwnership(performer, token('EX-1'));
    expect(verdict).toMatchObject({ outcome: 'verified', source: 'lamatok' });
  });
});
