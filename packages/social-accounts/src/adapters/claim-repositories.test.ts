import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accountId } from '@engagement-exchange/verification';
import { handle } from '@engagement-exchange/verification/testing';
import { describe, expect, it } from 'vitest';
import {
  awaitingFollow,
  eligibilityFailed,
  markVerified,
  type ClaimDraft,
} from '../domain/claim.ts';
import { claimId, userId } from '../domain/ids.ts';
import { fileClaimRepository } from './file-claim-repository.ts';
import { inMemoryClaimRepository } from './in-memory-claim-repository.ts';

const draft = (id: string, user: string, account: string): ClaimDraft => ({
  id: claimId(id),
  userId: userId(user),
  handle: handle(account),
  eligibility: { eligible: true, results: [] },
  startedAt: 0,
  ttlMs: 1,
});
const pending = (id: string, user: string, account: string) =>
  awaitingFollow(draft(id, user, account), accountId('tiktok', id), handle('verify.one'));

describe('inMemoryClaimRepository', () => {
  it('counts only claims that hold an account', async () => {
    const repository = inMemoryClaimRepository();
    await repository.save(pending('a', 'alice', 'one'));
    await repository.save(markVerified(pending('b', 'alice', 'two')));
    await repository.save(eligibilityFailed(draft('c', 'alice', 'three')));
    await repository.save(pending('d', 'bob', 'four'));
    await expect(repository.countHeldBy(userId('alice'), 'tiktok')).resolves.toBe(2);
    await expect(repository.countHeldBy(userId('bob'), 'tiktok')).resolves.toBe(1);
  });

  it('finds the holder of an account by normalized handle, preferring a verified claim', async () => {
    const repository = inMemoryClaimRepository();
    await repository.save(pending('a', 'alice', 'Some.Creator'));
    await repository.save(markVerified(pending('b', 'bob', 'some.creator')));
    await expect(repository.findHolder(handle('@some.creator'))).resolves.toMatchObject({
      id: 'b',
    });
    await expect(repository.findHolder(handle('other'))).resolves.toBeUndefined();
  });
});

describe('fileClaimRepository', () => {
  it('persists claims across instances', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'claims-')), 'claims.json');
    await fileClaimRepository(path).save(pending('a', 'alice', 'one'));
    const reopened = fileClaimRepository(path);
    await expect(reopened.findById(claimId('a'))).resolves.toMatchObject({
      state: 'awaiting_follow',
    });
    await expect(reopened.countHeldBy(userId('alice'), 'tiktok')).resolves.toBe(1);
  });
});
