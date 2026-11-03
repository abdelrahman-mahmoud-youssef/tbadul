import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { failed, type Answer } from '../domain/answer.ts';
import { sourceErrorKinds } from '../domain/outcome.ts';
import { fakeSource } from '../testing/fake-source.ts';
import { followsCheck, listEvidence } from '../testing/fixtures.ts';
import { manualClock } from '../testing/manual-clock.ts';
import { recordingSink } from '../testing/recording-sink.ts';
import { everyKind } from '../testing/orders.ts';
import { verifyWith } from './chain.ts';

const cost = { unit: 'request', amount: 1 } as const;

const answer: fc.Arbitrary<Answer<'follows'>> = fc.oneof(
  fc
    .constantFrom('verified', 'not_following')
    .map((outcome): Answer<'follows'> => ({ outcome, evidence: listEvidence, cost })),
  fc.constantFrom('private', 'not_found').map((outcome): Answer<'follows'> => ({ outcome, cost })),
  fc
    .constantFrom(...sourceErrorKinds)
    .map((kind): Answer<'follows'> => failed({ kind, message: kind })),
);

const run = async (answers: readonly Answer<'follows'>[]) => {
  const sources = answers.map((follows, index) => fakeSource(`s${index}`, { follows }));
  const verify = verifyWith({
    sources: everyKind(sources),
    clock: manualClock(),
    measurements: recordingSink(),
    pageCap: 1,
    confirmNotFollowing: false,
  });
  return verify(followsCheck);
};

describe('chain invariants', () => {
  it('never answers not_following unless a source answered not_following', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(answer, { maxLength: 8 }), async (answers) => {
        const verdict = await run(answers);
        if (verdict.outcome === 'not_following') {
          expect(answers.some((a) => a.outcome === 'not_following')).toBe(true);
        }
      }),
    );
  });

  it('answers with the first definitive source and records exactly the sources consulted', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(answer, { maxLength: 8 }), async (answers) => {
        const verdict = await run(answers);
        const first = answers.findIndex((a) => a.outcome !== 'source_error');
        if (first === -1) {
          expect(verdict.outcome).toBe('source_error');
          expect(verdict.attempts).toHaveLength(answers.length);
        } else {
          expect(verdict).toMatchObject({ outcome: answers[first]?.outcome, source: `s${first}` });
          expect(verdict.attempts).toHaveLength(first + 1);
        }
        expect(verdict.attempts.map((a) => a.outcome)).toEqual(
          answers.slice(0, verdict.attempts.length).map((a) => a.outcome),
        );
      }),
    );
  });

  it('answers source_error whenever every source fails, for every error kind', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...sourceErrorKinds), { minLength: 1, maxLength: 8 }),
        async (kinds) => {
          const verdict = await run(kinds.map((kind) => failed({ kind, message: kind })));
          expect(verdict.outcome).toBe('source_error');
          expect(verdict.attempts.map((a) => a.error?.kind)).toEqual(kinds);
        },
      ),
    );
  });
});
