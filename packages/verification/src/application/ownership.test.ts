import { describe, expect, it } from 'vitest';
import { failed, type Answer } from '../domain/answer.ts';
import { fakeSource, type FakeAnswers } from '../testing/fake-source.ts';
import { performer, profileEvidence, token } from '../testing/fixtures.ts';
import { manualClock } from '../testing/manual-clock.ts';
import { recordingSink } from '../testing/recording-sink.ts';
import { everyKind } from '../testing/orders.ts';
import { verifyWith } from './chain.ts';
import { verifyOwnershipWith } from './ownership.ts';

const cost = { unit: 'request', amount: 1 } as const;
const read = (bio: string): Answer<'profile'> => ({
  outcome: 'verified',
  evidence: profileEvidence(bio),
  cost,
});

const ownership = (answers: FakeAnswers) =>
  verifyOwnershipWith(
    verifyWith({
      sources: everyKind([fakeSource('s0', answers)]),
      clock: manualClock(),
      measurements: recordingSink(),
      pageCap: 1,
      confirmNotFollowing: false,
    }),
  );

describe('verifyOwnership', () => {
  const proof = token('EX-7f3a');

  it('answers verified when the bio contains the token as a whole word', async () => {
    const verdict = await ownership({ profile: read('creator | EX-7f3a | dm for collabs') })(
      performer,
      proof,
    );
    expect(verdict).toMatchObject({ outcome: 'verified', source: 's0' });
  });

  it('answers not_following with the profile evidence when the token is absent', async () => {
    const verdict = await ownership({ profile: read('creator | dm for collabs') })(
      performer,
      proof,
    );
    expect(verdict).toMatchObject({
      outcome: 'not_following',
      source: 's0',
      evidence: { bio: 'creator | dm for collabs' },
    });
    expect(verdict.attempts).toHaveLength(1);
  });

  it('answers not_following when the token is only part of a longer word', async () => {
    const verdict = await ownership({ profile: read('xEX-7f3a') })(performer, proof);
    expect(verdict.outcome).toBe('not_following');
  });

  it.each([
    ['private', { outcome: 'private', cost } satisfies Answer<'profile'>],
    ['not_found', { outcome: 'not_found', cost } satisfies Answer<'profile'>],
    ['source_error', failed({ kind: 'blocked', message: 'captcha' })],
  ])('passes a %s verdict through unchanged', async (outcome, answer) => {
    const verdict = await ownership({ profile: answer })(performer, proof);
    expect(verdict.outcome).toBe(outcome);
    expect(verdict.attempts).toHaveLength(1);
  });
});
