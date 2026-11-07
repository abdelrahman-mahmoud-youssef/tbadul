import { describe, expect, it } from 'vitest';
import type { Attempt } from '../domain/attempt.ts';
import { recordingSink } from '../testing/recording-sink.ts';
import { allSinks, fallbackCounter } from './fallback-counter.ts';

const hour = 3_600_000;
const start = Date.UTC(2026, 10, 7, 10);

const attempt = (source: string, outcome: Attempt['outcome'], startedAt: number): Attempt => ({
  source,
  platform: 'tiktok',
  check: 'follows',
  outcome,
  ...(outcome === 'source_error' && { error: { kind: 'blocked', message: 'blocked' } }),
  startedAt,
  latencyMs: 10,
});

describe('fallbackCounter', () => {
  it('counts source errors per source per hour and ignores settled answers', () => {
    const counter = fallbackCounter();
    counter.record(attempt('scraper', 'source_error', start));
    counter.record(attempt('scraper', 'source_error', start + 59 * 60_000));
    counter.record(attempt('ensemble', 'source_error', start + 1000));
    counter.record(attempt('scraper', 'verified', start + 2000));
    counter.record(attempt('scraper', 'source_error', start + hour));

    expect(counter.counts()).toEqual([
      { source: 'scraper', hour: '2026-11-07T10:00:00.000Z', count: 2 },
      { source: 'ensemble', hour: '2026-11-07T10:00:00.000Z', count: 1 },
      { source: 'scraper', hour: '2026-11-07T11:00:00.000Z', count: 1 },
    ]);
  });

  it('keeps only the most recent hours', () => {
    const counter = fallbackCounter(2);
    counter.record(attempt('scraper', 'source_error', start));
    counter.record(attempt('scraper', 'source_error', start + hour));
    counter.record(attempt('scraper', 'source_error', start + 2 * hour));

    expect(counter.counts().map(({ hour: at }) => at)).toEqual([
      '2026-11-07T11:00:00.000Z',
      '2026-11-07T12:00:00.000Z',
    ]);
  });

  it('hands every attempt to every sink', () => {
    const first = recordingSink();
    const second = recordingSink();
    allSinks(first, second).record(attempt('scraper', 'verified', start));

    expect(first.attempts).toHaveLength(1);
    expect(second.attempts).toHaveLength(1);
  });
});
