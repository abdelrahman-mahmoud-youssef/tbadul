import { describe, expect, it } from 'vitest';
import { askFollows } from '../testing/fake-source.ts';
import { context, followsCheck, listEvidence, profileCheck } from '../testing/fixtures.ts';
import { defineSource } from './define-source.ts';

describe('defineSource', () => {
  const source = defineSource(
    { name: 'fake', platform: 'tiktok' },
    {
      follows: (check) =>
        Promise.resolve({
          answers: check.targets.map(() => ({
            outcome: 'verified',
            evidence: listEvidence,
            cost: { unit: 'request', amount: 1 },
          })),
          listed: [],
        }),
    },
  );

  it('derives the supported check kinds from the handlers given', () => {
    expect([...source.supports]).toEqual(['follows']);
  });

  it('dispatches a check to its handler', async () => {
    await expect(askFollows(source, followsCheck, context())).resolves.toMatchObject({
      outcome: 'verified',
      evidence: listEvidence,
    });
  });

  it('answers source_error for a kind it has no handler for', async () => {
    await expect(source.answer(profileCheck, context())).resolves.toEqual({
      outcome: 'source_error',
      error: { kind: 'unexpected', message: 'fake does not support profile' },
    });
  });
});
