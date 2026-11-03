import type {
  Check,
  Handle,
  ListEvidence,
  Outcome,
  ProfileEvidence,
  Verdict,
  Verifier,
} from '@engagement-exchange/verification';
import { profileEvidence } from '@engagement-exchange/verification/testing';

export interface FakeVerifierScript {
  readonly profile?: (subject: Handle) => Outcome | ProfileEvidence;
  readonly follows?: (performer: Handle, target: Handle) => Outcome;
}

export interface FakeVerifier extends Verifier {
  readonly calls: readonly Check[];
}

const listEvidence: ListEvidence = { pagesRead: 1, listExhausted: false, entriesRead: 1 };

const verdict = (check: Check, outcome: Outcome, evidence?: unknown): never => {
  const attempts = [] as const;
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
  const verify = <C extends Check>(check: C): Promise<Verdict<C['kind']>> => {
    calls.push(check);
    switch (check.kind) {
      case 'profile': {
        const answer = script.profile?.(check.subject) ?? eligibleProfile();
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
    verify: verify as Verifier['verify'],
    verifyOwnership: () => Promise.reject(new Error('not scripted')),
  };
};
