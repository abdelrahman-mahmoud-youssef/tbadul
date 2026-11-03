import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accountId } from '@engagement-exchange/verification';
import { handle } from '@engagement-exchange/verification/testing';
import { describe, expect, it } from 'vitest';
import {
  awaitingFollow,
  eligibilityFailed,
  markRejected,
  markVerified,
  type AccountClaim,
  type ClaimDraft,
} from '../domain/claim.ts';
import { claimId, userId } from '../domain/ids.ts';
import { fileClaimRepository } from './file-claim-repository.ts';
import { inMemoryClaimRepository } from './in-memory-claim-repository.ts';

const ttlMs = 1000;
const alice = userId('alice');
const bob = userId('bob');
const limit = { maxHeld: 5, now: 0 };

const draft = (id: string, user: string, account: string, startedAt = 0): ClaimDraft => ({
  id: claimId(id),
  userId: userId(user),
  handle: handle(account),
  accountId: accountId('tiktok', account),
  eligibility: { eligible: true, results: [] },
  startedAt,
  ttlMs,
});
const pending = (id: string, user: string, account: string, startedAt = 0) =>
  awaitingFollow(draft(id, user, account, startedAt), handle('verify.one'));

const stored = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value;
};

describe('inMemoryClaimRepository', () => {
  it('counts verified claims and open claims until they expire', async () => {
    const repository = inMemoryClaimRepository();
    await repository.create(pending('a', 'alice', 'one'), limit);
    const linked = stored(await repository.create(pending('b', 'alice', 'two'), limit));
    await repository.verify(markVerified(linked));
    await repository.create(eligibilityFailed(draft('c', 'alice', 'three')), limit);
    await repository.create(pending('d', 'bob', 'four'), limit);
    await expect(repository.countHeld(alice, 'tiktok', ttlMs - 1)).resolves.toBe(2);
    await expect(repository.countHeld(alice, 'tiktok', ttlMs)).resolves.toBe(1);
    await expect(repository.countHeld(bob, 'tiktok', 0)).resolves.toBe(1);
  });

  it('refuses a claim at the limit it is given', async () => {
    const repository = inMemoryClaimRepository();
    await repository.create(pending('a', 'alice', 'one'), { maxHeld: 2, now: 0 });
    await repository.create(pending('b', 'alice', 'two'), { maxHeld: 2, now: 0 });
    await expect(
      repository.create(pending('c', 'alice', 'three'), { maxHeld: 2, now: 0 }),
    ).resolves.toEqual({ ok: false, error: 'limit_reached' });
    await expect(
      repository.create(pending('c', 'alice', 'three'), { maxHeld: 2, now: ttlMs }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('keeps one open claim per user and account, expiring a stale one on create', async () => {
    const repository = inMemoryClaimRepository();
    await repository.create(pending('a', 'alice', 'one'), limit);
    await expect(repository.create(pending('b', 'alice', 'one'), limit)).resolves.toEqual({
      ok: false,
      error: 'claim_open',
    });
    await expect(repository.create(pending('c', 'bob', 'one'), limit)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repository.create(pending('d', 'alice', 'one', ttlMs), { maxHeld: 5, now: ttlMs }),
    ).resolves.toMatchObject({ ok: true });
    await expect(repository.findById(claimId('a'))).resolves.toMatchObject({
      state: 'expired',
      version: 1,
    });
  });

  it('finds the open unexpired claim of a user on an account', async () => {
    const repository = inMemoryClaimRepository();
    await repository.create(pending('a', 'alice', 'one'), limit);
    const account = accountId('tiktok', 'one');
    await expect(repository.findOpen(alice, account, 0)).resolves.toMatchObject({ id: 'a' });
    await expect(repository.findOpen(alice, account, ttlMs)).resolves.toBeUndefined();
    await expect(repository.findOpen(bob, account, 0)).resolves.toBeUndefined();
  });

  it('saves by compare-and-set on the version', async () => {
    const repository = inMemoryClaimRepository();
    const claim = stored(await repository.create(pending('a', 'alice', 'one'), limit));
    const first = stored(await repository.save(markRejected(claim, 'pool_exhausted')));
    expect(first.version).toBe(1);
    await expect(repository.save(claim)).resolves.toEqual({
      ok: false,
      error: 'version_conflict',
    });
    await expect(repository.save(pending('missing', 'alice', 'two'))).resolves.toEqual({
      ok: false,
      error: 'version_conflict',
    });
  });

  it('lets one claim own an account and refuses the next', async () => {
    const repository = inMemoryClaimRepository();
    const mine = stored(await repository.create(pending('a', 'alice', 'one'), limit));
    const theirs = stored(await repository.create(pending('b', 'bob', 'one'), limit));
    await expect(repository.verify(markVerified(mine))).resolves.toMatchObject({
      ok: true,
      value: { state: 'verified', version: 1 },
    });
    await expect(repository.verify(markVerified(theirs))).resolves.toEqual({
      ok: false,
      error: 'account_already_claimed',
    });
    await expect(repository.findOwner(accountId('tiktok', 'one'))).resolves.toBe(alice);
    await expect(repository.findOwner(accountId('tiktok', 'two'))).resolves.toBeUndefined();
    await expect(repository.verify(markVerified(mine))).resolves.toEqual({
      ok: false,
      error: 'version_conflict',
    });
  });
});

describe('fileClaimRepository', () => {
  it('persists every change across instances', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'claims-')), 'claims.json');
    const claim: AccountClaim = stored(
      await fileClaimRepository(path).create(pending('a', 'alice', 'one'), limit),
    );
    await fileClaimRepository(path).verify(markVerified(claim));
    const reopened = fileClaimRepository(path);
    await expect(reopened.findById(claimId('a'))).resolves.toMatchObject({
      state: 'verified',
      version: 1,
    });
    await expect(reopened.findOwner(accountId('tiktok', 'one'))).resolves.toBe(alice);
    await expect(reopened.countHeld(alice, 'tiktok', ttlMs)).resolves.toBe(1);
  });
});
