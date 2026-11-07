import { describe, expect, it } from 'vitest';
import type { Answer } from '../../domain/answer.ts';
import { askFollows, fakeSource } from '../../testing/fake-source.ts';
import { context, followsCheck, listEvidence } from '../../testing/fixtures.ts';
import { withBulkhead } from './with-bulkhead.ts';

const verified: Answer<'follows'> = {
  outcome: 'verified',
  evidence: listEvidence,
  cost: { unit: 'request', amount: 1 },
};

describe('withBulkhead', () => {
  it('runs up to the limit, queues the next and answers rate_limited beyond the queue', async () => {
    const releases: (() => void)[] = [];
    let running = 0;
    let peak = 0;
    const source = fakeSource('scraptik', {
      follows: () =>
        new Promise((resolve) => {
          running += 1;
          peak = Math.max(peak, running);
          releases.push(() => {
            running -= 1;
            resolve(verified);
          });
        }),
    });
    const limited = withBulkhead(source, { limit: 2, queue: 1 });

    const pending = Array.from({ length: 4 }, () => askFollows(limited, followsCheck, context()));
    await expect(pending[3]).resolves.toMatchObject({
      outcome: 'source_error',
      error: { kind: 'rate_limited' },
    });
    while (releases.length > 0 || running > 0) {
      releases.shift()?.();
      await new Promise((resolve) => setImmediate(resolve));
    }
    const answers = await Promise.all(pending.slice(0, 3));

    expect(answers.map(({ outcome }) => outcome)).toEqual(['verified', 'verified', 'verified']);
    expect(peak).toBe(2);
  });
});
