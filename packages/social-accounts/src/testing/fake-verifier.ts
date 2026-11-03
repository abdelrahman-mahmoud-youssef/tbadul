import {
  accountId,
  type Attempt,
  type Check,
  type Handle,
  type ListEvidence,
  type Outcome,
  type ProfileEvidence,
  type Verdict,
  type Verifier,
  type VerifyOptions,
} from '@engagement-exchange/verification';
import { profileEvidence } from '@engagement-exchange/verification/testing';

export interface FakeVerifierScript {
  readonly profile?: (subject: Handle) => Outcome | ProfileEvidence;
  readonly follows?: (performer: Handle, target: Handle) => Outcome;
}

export interface FakeVerifier extends Verifier {
  readonly calls: readonly Check[];
  readonly options: readonly (VerifyOptions | undefined)[];
}

const listEvidence: ListEvidence = { pagesRead: 1, listExhausted: false, entriesRead: 1 };

export const fakeLatencyMs = 42;

const verdict = (check: Check, outcome: Outcome, evidence?: unknown): never => {
  const attempts: readonly Attempt[] = [
    {
      source: 'fake',
      platform: 'tiktok',
      check: check.kind,
      outcome,
      startedAt: 0,
      latencyMs: fakeLatencyMs,
    },
  ];
  if (outcome === 'source_error') return { outcome, check, attempts } as never;
  if (outcome === 'private' || outcome === 'not_found') {
    return { outcome, source: 'fake', check, attempts } as never;
  }
  return { outcome, evidence, source: 'fake', check, attempts } as never;
};

export const eligibleProfile = (): ProfileEvidence => ({
  ...profileEvidence('a creator'),
  followingVisible: true,
  likesVisible: false,
  followerCount: 1200,
  videoCount: 40,
  avatarUrl: 'https://cdn.example/avatar/abc~tplv.jpeg',
  createdAt: Date.UTC(2020, 0, 1),
  latestPostAt: Date.UTC(2026, 9, 1),
});

export const fakeVerifier = (script: FakeVerifierScript): FakeVerifier => {
  const calls: Check[] = [];
  const options: (VerifyOptions | undefined)[] = [];
  const verify = <C extends Check>(
    check: C,
    given?: VerifyOptions,
  ): Promise<Verdict<C['kind']>> => {
    calls.push(check);
    options.push(given);
    switch (check.kind) {
      case 'profile': {
        const answer = script.profile?.(check.subject) ?? {
          ...eligibleProfile(),
          accountId: accountId(check.subject.platform, check.subject.value),
        };
        return Promise.resolve(
          typeof answer === 'string' ? verdict(check, answer) : verdict(check, 'verified', answer),
        );
      }
      case 'follows':
        return Promise.resolve(
          verdict(
            check,
            script.follows?.(check.performer, check.target) ?? 'not_following',
            listEvidence,
          ),
        );
      case 'liked':
        return Promise.resolve(verdict(check, 'source_error'));
    }
  };
  return {
    calls,
    options,
    verify: verify as Verifier['verify'],
    verifyOwnership: () => Promise.reject(new Error('not scripted')),
  };
};
