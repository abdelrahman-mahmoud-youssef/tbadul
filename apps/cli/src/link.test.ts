import {
  configVerificationAccountPool,
  createSocialAccounts,
  inMemoryClaimRepository,
  type SocialAccounts,
} from '@engagement-exchange/social-accounts';
import { createVerifier, type Answer } from '@engagement-exchange/verification';
import {
  fakeSource,
  handle,
  listEvidence,
  profileEvidence,
  sameOrder,
} from '@engagement-exchange/verification/testing';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { linkStart } from './link.ts';

const cost = { unit: 'request', amount: 1 } as const;

const social = (follows: Answer<'follows'>): SocialAccounts => {
  let counter = 0;
  return createSocialAccounts(
    { eligibility: {}, cooldown: {} },
    {
      verifier: createVerifier(
        { order: sameOrder(['scraper']), timeoutMs: 1000, pageCap: 1 },
        {
          sources: [
            fakeSource('scraper', {
              profile: { outcome: 'verified', evidence: profileEvidence('bio'), cost },
              follows,
            }),
          ],
        },
      ),
      repository: inMemoryClaimRepository(),
      pool: configVerificationAccountPool([handle('verify.one'), handle('verify.two')], () => 0),
      ids: { next: () => `claim-${String(++counter)}` },
    },
  );
};

describe('linkStart', () => {
  let log: MockInstance;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('assigns a verification account the claimed account does not follow', async () => {
    const code = await linkStart(
      social({ outcome: 'not_following', evidence: listEvidence, cost }),
      'local',
      'some.creator',
    );
    expect(code).toBe(0);
    expect(log.mock.calls.flat()).toContain(
      'follow @verify.one from @some.creator, then run link verify claim-1',
    );
  });

  it('refuses when the account already follows every verification account', async () => {
    const code = await linkStart(
      social({ outcome: 'verified', evidence: listEvidence, cost }),
      'local',
      'some.creator',
    );
    expect(code).toBe(1);
    expect(log.mock.calls.flat()).toContain(
      'refused: @some.creator already follows every verification account given',
    );
  });
});
