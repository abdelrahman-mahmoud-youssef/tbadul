import { accountId } from '@engagement-exchange/verification';
import { handle } from '@engagement-exchange/verification/testing';
import { describe, expect, it } from 'vitest';
import { configVerificationAccountPool } from './config-verification-account-pool.ts';

describe('configVerificationAccountPool', () => {
  it('counts assignments by account id', async () => {
    const one = { handle: handle('verify.one'), accountId: accountId('tiktok', 'one') };
    const two = { handle: handle('verify.two'), accountId: accountId('tiktok', 'two') };
    const pool = configVerificationAccountPool([one, two], () => 0);

    await pool.recordAssignment(one.accountId);

    await expect(pool.candidates('tiktok')).resolves.toEqual([two, one]);
  });
});
