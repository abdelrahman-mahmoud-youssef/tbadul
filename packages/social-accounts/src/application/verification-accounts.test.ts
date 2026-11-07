import { accountId, type Verifier } from '@engagement-exchange/verification';
import { handle, manualClock } from '@engagement-exchange/verification/testing';
import { describe, expect, it } from 'vitest';
import {
  eligibleProfile,
  fakeVerifier,
  type FakeVerifierScript,
} from '../testing/fake-verifier.ts';
import { inMemoryVerificationAccountAdmin } from '../testing/in-memory-verification-account-admin.ts';
import {
  addVerificationAccountWith,
  listVerificationAccountsWith,
  setVerificationAccountActiveWith,
} from './verification-accounts.ts';

const setup = (script: FakeVerifierScript = {}, verifier: Verifier = fakeVerifier(script)) => {
  const accounts = inMemoryVerificationAccountAdmin();
  const clock = manualClock(Date.UTC(2026, 10, 7));
  const deps = { verifier, accounts, clock };
  return {
    accounts,
    clock,
    add: addVerificationAccountWith(deps),
    list: listVerificationAccountsWith(deps),
    setActive: setVerificationAccountActiveWith(deps),
  };
};

const verifyOne = { handle: handle('verify.one'), accountId: accountId('tiktok', 'verify.one') };

describe('addVerificationAccount', () => {
  it('adds an account by the id its profile resolves to, then answers present', async () => {
    const verifier = fakeVerifier({});
    const { add, accounts, clock } = setup({}, verifier);

    const added = await add({ platform: 'tiktok', account: '@Verify.One' });
    const again = await add({ platform: 'tiktok', account: 'verify.one' });

    expect(added).toEqual({ ok: true, value: { account: verifyOne, status: 'added' } });
    expect(again).toEqual({ ok: true, value: { account: verifyOne, status: 'present' } });
    expect(accounts.seenAt).toEqual([clock.now(), clock.now()]);
    expect(verifier.calls).toEqual([
      { kind: 'profile', subject: verifyOne.handle },
      { kind: 'profile', subject: verifyOne.handle },
    ]);
    expect(verifier.options).toEqual([undefined, undefined]);
  });

  it('answers inactive for an account that is pooled but deactivated', async () => {
    const { add, setActive } = setup();
    await add({ platform: 'tiktok', account: 'verify.one' });
    await setActive({ platform: 'tiktok', accountId: 'verify.one', active: false });

    await expect(add({ platform: 'tiktok', account: 'verify.one' })).resolves.toEqual({
      ok: true,
      value: { account: verifyOne, status: 'inactive' },
    });
  });

  it('refuses an invalid handle without a profile check', async () => {
    const verifier = fakeVerifier({});
    const { add } = setup({}, verifier);

    await expect(add({ platform: 'tiktok', account: 'not valid' })).resolves.toEqual({
      ok: false,
      error: { kind: 'invalid_handle', reason: 'characters' },
    });
    expect(verifier.calls).toEqual([]);
  });

  it.each(['private', 'not_found'] as const)(
    'answers the %s profile outcome and adds nothing',
    async (outcome) => {
      const { add, list } = setup({ profile: () => outcome });

      await expect(add({ platform: 'tiktok', account: 'verify.one' })).resolves.toEqual({
        ok: false,
        error: { kind: 'profile_unavailable', outcome },
      });
      await expect(list({ platform: 'tiktok' })).resolves.toEqual([]);
    },
  );

  it('names the source error kind of the last attempt on a source_error', async () => {
    const verifier = fakeVerifier({});
    const { add } = setup(
      {},
      {
        ...verifier,
        verify: (check) =>
          Promise.resolve({
            outcome: 'source_error',
            check,
            attempts: [
              {
                source: 'fake',
                platform: 'tiktok',
                check: check.kind,
                outcome: 'source_error',
                error: { kind: 'timeout' },
                startedAt: 0,
                latencyMs: 1,
              },
            ],
          }) as never,
      },
    );

    await expect(add({ platform: 'tiktok', account: 'verify.one' })).resolves.toEqual({
      ok: false,
      error: { kind: 'profile_unavailable', outcome: 'source_error', sourceError: 'timeout' },
    });
  });
});

describe('listVerificationAccounts', () => {
  it('lists the pooled accounts of the platform with their state', async () => {
    const { add, list } = setup({
      profile: (subject) => ({
        ...eligibleProfile(),
        accountId: accountId('tiktok', `${subject.value}-id`),
      }),
    });
    await add({ platform: 'tiktok', account: 'verify.one' });

    await expect(list({ platform: 'tiktok' })).resolves.toEqual([
      {
        accountId: accountId('tiktok', 'verify.one-id'),
        handle: handle('verify.one'),
        active: true,
        assignedCount: 0,
      },
    ]);
  });
});

describe('setVerificationAccountActive', () => {
  it('deactivates and reactivates a pooled account by its account id', async () => {
    const { add, setActive } = setup();
    await add({ platform: 'tiktok', account: 'verify.one' });

    await expect(
      setActive({ platform: 'tiktok', accountId: 'verify.one', active: false }),
    ).resolves.toEqual({ ok: true, value: { ...verifyOne, active: false, assignedCount: 0 } });
    await expect(
      setActive({ platform: 'tiktok', accountId: 'verify.one', active: true }),
    ).resolves.toMatchObject({ ok: true, value: { active: true } });
  });

  it('answers verification_account_not_found for an account that is not pooled', async () => {
    const { setActive } = setup();

    await expect(
      setActive({ platform: 'tiktok', accountId: 'unknown', active: false }),
    ).resolves.toEqual({ ok: false, error: { kind: 'verification_account_not_found' } });
  });
});
