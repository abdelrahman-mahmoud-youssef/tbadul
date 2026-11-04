import { randomUUID } from 'node:crypto';
import {
  auth_users,
  platformAccounts,
  verificationAccounts,
  type Database,
} from '@engagement-exchange/db';
import { accountId, type Handle } from '@engagement-exchange/verification';
import { handle } from '@engagement-exchange/verification/testing';
import { single } from '../adapters/drizzle/rows.ts';
import { awaitingFollow, type AccountClaim } from '../domain/claim.ts';
import { claimId, userId, type UserId } from '../domain/ids.ts';
import type { VerificationCandidate } from '../ports/verification-account-pool.ts';

export const uniqueHandle = (prefix: string): Handle =>
  handle(`${prefix}_${randomUUID().slice(0, 8)}`);

export const insertUser = async (db: Database): Promise<UserId> =>
  userId(
    single(
      await db
        .insert(auth_users)
        .values({ name: 'user', email: `${randomUUID()}@example.test`, updatedAt: new Date() })
        .returning({ id: auth_users.id }),
    ).id,
  );

export const insertVerificationAccount = async (
  db: Database,
  account: Handle,
  assignedCount = 0,
): Promise<VerificationCandidate> => {
  const external = randomUUID();
  const row = single(
    await db
      .insert(platformAccounts)
      .values({
        platform: account.platform,
        externalId: external,
        handle: account.value,
        handleSeenAt: new Date(),
      })
      .returning({ id: platformAccounts.id }),
  );
  await db.insert(verificationAccounts).values({ platformAccountId: row.id, assignedCount });
  return { handle: account, accountId: accountId(account.platform, external) };
};

export const openClaim = (
  user: UserId,
  verificationAccount: VerificationCandidate,
  startedAt: number,
  external: string = randomUUID(),
): AccountClaim =>
  awaitingFollow(
    {
      id: claimId(randomUUID()),
      userId: user,
      handle: uniqueHandle('creator'),
      accountId: accountId('tiktok', external),
      eligibility: { eligible: true, results: [{ rule: 'public_account', result: 'pass' }] },
      startedAt,
      ttlMs: 86_400_000,
    },
    verificationAccount.handle,
    verificationAccount.accountId,
  );
