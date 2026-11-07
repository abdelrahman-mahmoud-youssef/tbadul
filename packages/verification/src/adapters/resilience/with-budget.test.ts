import { describe, expect, it } from 'vitest';
import type { Answer } from '../../domain/answer.ts';
import type { SpendLedger } from '../../ports/spend-ledger.ts';
import { askFollows, fakeSource } from '../../testing/fake-source.ts';
import { context, followsCheck, listEvidence } from '../../testing/fixtures.ts';
import { manualClock } from '../../testing/manual-clock.ts';
import { withBudget } from './with-budget.ts';

const day = 86_400_000;
const units = (amount: number) => ({ unit: 'units', amount }) as const;
const verified = (amount: number): Answer<'follows'> => ({
  outcome: 'verified',
  evidence: listEvidence,
  cost: units(amount),
});

const harness = (options: {
  daily: number;
  seeded?: number;
  cost?: number;
  ledger?: SpendLedger;
}) => {
  const clock = manualClock(Date.UTC(2026, 10, 7, 12));
  const reached: string[] = [];
  const source = fakeSource('ensemble', { follows: verified(options.cost ?? 1) });
  const ledger: SpendLedger = options.ledger ?? {
    spentSince: () => Promise.resolve(options.seeded ?? 0),
  };
  const budgeted = withBudget(
    source,
    { unit: 'units', daily: options.daily },
    { ledger, clock, onReached: (name, on) => reached.push(`${name} ${on}`) },
  );
  const ask = () => askFollows(budgeted, followsCheck, context());
  return { ask, source, clock, reached };
};

describe('withBudget', () => {
  it('lets calls through until the spend reaches the daily budget', async () => {
    const { ask, source } = harness({ daily: 4, cost: 2 });

    await expect(ask()).resolves.toMatchObject({ outcome: 'verified' });
    await expect(ask()).resolves.toMatchObject({ outcome: 'verified' });
    await expect(ask()).resolves.toMatchObject({
      outcome: 'source_error',
      error: { kind: 'budget' },
    });
    expect(source.calls).toHaveLength(2);
  });

  it('counts the spend already recorded today', async () => {
    const { ask, source } = harness({ daily: 10, seeded: 10 });

    await expect(ask()).resolves.toMatchObject({ error: { kind: 'budget' } });
    expect(source.calls).toHaveLength(0);
  });

  it('lets exactly one of many concurrent calls through one unit below the budget', async () => {
    const { ask, source } = harness({ daily: 10, seeded: 9 });

    const answers = await Promise.all(Array.from({ length: 20 }, ask));

    expect(answers.filter(({ outcome }) => outcome === 'verified')).toHaveLength(1);
    expect(source.calls).toHaveLength(1);
  });

  it('warns once a day and starts a new count the next day', async () => {
    const { ask, clock, reached, source } = harness({ daily: 1 });
    await ask();
    await ask();
    await ask();

    expect(reached).toEqual(['ensemble 2026-11-07']);
    clock.advance(day);
    await expect(ask()).resolves.toMatchObject({ outcome: 'verified' });
    await ask();
    expect(reached).toEqual(['ensemble 2026-11-07', 'ensemble 2026-11-08']);
    expect(source.calls).toHaveLength(2);
  });

  it('refuses rather than spends when the recorded spend cannot be read', async () => {
    const { ask, source } = harness({
      daily: 10,
      ledger: { spentSince: () => Promise.reject(new Error('database down')) },
    });

    await expect(ask()).resolves.toMatchObject({ error: { kind: 'budget' } });
    expect(source.calls).toHaveLength(0);
  });

  it('reads the recorded spend from the start of the day', async () => {
    const since: number[] = [];
    const { ask } = harness({
      daily: 10,
      ledger: {
        spentSince: (_source, _unit, start) => {
          since.push(start);
          return Promise.resolve(0);
        },
      },
    });

    await ask();
    await ask();

    expect(since).toEqual([Date.UTC(2026, 10, 7)]);
  });
});
