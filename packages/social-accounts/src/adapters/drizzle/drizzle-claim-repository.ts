import {
  accountClaims,
  activeLinkIndex,
  claimAttempts,
  linkedAccounts,
  openClaimIndex,
  platformAccounts,
  type Database,
} from '@engagement-exchange/db';
import { err, ok, type Platform, type Result } from '@engagement-exchange/verification';
import { and, asc, eq, gt, lte, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AccountClaim } from '../../domain/claim.ts';
import type { EligibilityReport } from '../../domain/eligibility.ts';
import { claimId, userId, type UserId } from '../../domain/ids.ts';
import type {
  AccountClaimRepository,
  CreateClaimError,
  VerifyClaimError,
} from '../../ports/account-claim-repository.ts';
import {
  accountOf,
  handleOf,
  platformAccountOf,
  sameAccount,
  violates,
  type Executor,
  type Transaction,
} from './rows.ts';

const verification = alias(platformAccounts, 'verification_account');

const selectClaims = (db: Executor, where: SQL | undefined) =>
  db
    .select({
      claim: accountClaims,
      externalId: platformAccounts.externalId,
      numericId: platformAccounts.numericId,
      verificationExternalId: verification.externalId,
      verificationNumericId: verification.numericId,
    })
    .from(accountClaims)
    .innerJoin(platformAccounts, eq(platformAccounts.id, accountClaims.platformAccountId))
    .leftJoin(verification, eq(verification.id, accountClaims.verificationPlatformAccountId))
    .where(where)
    .limit(1);

const findClaim = async (
  db: Executor,
  where: SQL | undefined,
): Promise<AccountClaim | undefined> => {
  const [row] = await selectClaims(db, where);
  if (row === undefined) return undefined;
  const { claim } = row;
  const attempts = await db
    .select()
    .from(claimAttempts)
    .where(eq(claimAttempts.claimId, claim.id))
    .orderBy(asc(claimAttempts.at), asc(claimAttempts.id));
  return {
    id: claimId(claim.id),
    userId: userId(claim.userId),
    platform: claim.platform,
    handle: handleOf(claim.platform, claim.handle),
    accountId: accountOf(claim.platform, row),
    ...(claim.verificationHandle !== null && {
      verificationAccount: handleOf(claim.platform, claim.verificationHandle),
    }),
    ...(row.verificationExternalId !== null && {
      verificationAccountId: accountOf(claim.platform, {
        externalId: row.verificationExternalId,
        numericId: row.verificationNumericId,
      }),
    }),
    eligibility: claim.eligibility as EligibilityReport,
    state: claim.state,
    ...(claim.rejection !== null && { rejection: claim.rejection }),
    attempts: attempts.map((attempt) => ({
      at: attempt.at.getTime(),
      outcome: attempt.outcome,
      ...(attempt.source !== null && { source: attempt.source }),
      ...(attempt.latencyMs !== null && { latencyMs: attempt.latencyMs }),
    })),
    nextVerifyAt: claim.nextVerifyAt.getTime(),
    startedAt: claim.startedAt.getTime(),
    expiresAt: claim.expiresAt.getTime(),
    version: claim.version,
  };
};

const countHeld = async (
  db: Executor,
  user: UserId,
  platform: Platform,
  now: number,
): Promise<number> => {
  const links = await db.$count(
    linkedAccounts,
    and(
      eq(linkedAccounts.userId, user),
      eq(linkedAccounts.platform, platform),
      eq(linkedAccounts.status, 'active'),
    ),
  );
  const open = await db.$count(
    accountClaims,
    and(
      eq(accountClaims.userId, user),
      eq(accountClaims.platform, platform),
      eq(accountClaims.state, 'awaiting_follow'),
      gt(accountClaims.expiresAt, new Date(now)),
    ),
  );
  return links + open;
};

const appendAttempts = async (tx: Transaction, claim: AccountClaim, stored: number) => {
  const added = claim.attempts.slice(stored);
  if (added.length === 0) return;
  await tx.insert(claimAttempts).values(
    added.map((attempt) => ({
      claimId: claim.id,
      at: new Date(attempt.at),
      outcome: attempt.outcome,
      source: attempt.source ?? null,
      latencyMs: attempt.latencyMs ?? null,
    })),
  );
};

const update = async (tx: Transaction, claim: AccountClaim): Promise<string | undefined> => {
  const [updated] = await tx
    .update(accountClaims)
    .set({
      state: claim.state,
      rejection: claim.rejection ?? null,
      nextVerifyAt: new Date(claim.nextVerifyAt),
      version: claim.version + 1,
      updatedAt: sql`now()`,
    })
    .where(and(eq(accountClaims.id, claim.id), eq(accountClaims.version, claim.version)))
    .returning({ platformAccountId: accountClaims.platformAccountId });
  if (updated === undefined) return undefined;
  await appendAttempts(
    tx,
    claim,
    await tx.$count(claimAttempts, eq(claimAttempts.claimId, claim.id)),
  );
  return updated.platformAccountId;
};

const stored = (claim: AccountClaim): AccountClaim => ({ ...claim, version: claim.version + 1 });

export const drizzleClaimRepository = (db: Database): AccountClaimRepository => ({
  findById: (id) => findClaim(db, eq(accountClaims.id, id)),
  findOpen: (user, account, now) =>
    findClaim(
      db,
      and(
        eq(accountClaims.userId, user),
        sameAccount(account),
        eq(accountClaims.state, 'awaiting_follow'),
        gt(accountClaims.expiresAt, new Date(now)),
      ),
    ),
  findOwner: async (account) => {
    const [link] = await db
      .select({ userId: linkedAccounts.userId })
      .from(linkedAccounts)
      .innerJoin(platformAccounts, eq(platformAccounts.id, linkedAccounts.platformAccountId))
      .where(and(sameAccount(account), eq(linkedAccounts.status, 'active')));
    return link === undefined ? undefined : userId(link.userId);
  },
  countHeld: (user, platform, now) => countHeld(db, user, platform, now),
  create: async (claim, { maxHeld, now }) => {
    try {
      return await db.transaction(async (tx): Promise<Result<AccountClaim, CreateClaimError>> => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${claim.userId}::text || ':' || ${claim.platform}::text, 0))`,
        );
        if ((await countHeld(tx, claim.userId, claim.platform, now)) >= maxHeld) {
          return err('limit_reached');
        }
        const platformAccountId = await platformAccountOf(
          tx,
          claim.accountId,
          claim.handle,
          claim.startedAt,
        );
        await tx
          .update(accountClaims)
          .set({
            state: 'expired',
            version: sql`${accountClaims.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(accountClaims.userId, claim.userId),
              eq(accountClaims.platformAccountId, platformAccountId),
              eq(accountClaims.state, 'awaiting_follow'),
              lte(accountClaims.expiresAt, new Date(now)),
            ),
          );
        await tx.insert(accountClaims).values({
          id: claim.id,
          userId: claim.userId,
          platform: claim.platform,
          platformAccountId,
          handle: claim.handle.value,
          verificationPlatformAccountId:
            claim.verificationAccountId === undefined
              ? null
              : await platformAccountOf(
                  tx,
                  claim.verificationAccountId,
                  claim.verificationAccount,
                  claim.startedAt,
                ),
          verificationHandle: claim.verificationAccount?.value ?? null,
          state: claim.state,
          rejection: claim.rejection ?? null,
          eligibility: claim.eligibility,
          nextVerifyAt: new Date(claim.nextVerifyAt),
          startedAt: new Date(claim.startedAt),
          expiresAt: new Date(claim.expiresAt),
          version: claim.version,
        });
        await appendAttempts(tx, claim, 0);
        return ok(claim);
      });
    } catch (error) {
      if (violates(error, openClaimIndex)) return err('claim_open');
      throw error;
    }
  },
  save: (claim) =>
    db.transaction(async (tx) =>
      (await update(tx, claim)) === undefined ? err('version_conflict') : ok(stored(claim)),
    ),
  verify: async (claim) => {
    try {
      return await db.transaction(async (tx): Promise<Result<AccountClaim, VerifyClaimError>> => {
        const platformAccountId = await update(tx, claim);
        if (platformAccountId === undefined) return err('version_conflict');
        await tx.insert(linkedAccounts).values({
          userId: claim.userId,
          platform: claim.platform,
          platformAccountId,
          status: 'active',
          linkedAt: sql`now()`,
          claimId: claim.id,
        });
        return ok(stored(claim));
      });
    } catch (error) {
      if (violates(error, activeLinkIndex)) return err('account_already_claimed');
      throw error;
    }
  },
});
