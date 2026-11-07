import type {
  PooledAccount,
  VerificationAccounts,
  VerificationCandidate,
} from '@engagement-exchange/social-accounts';
import {
  err,
  ok,
  parseHandle,
  type Handle,
  type Result,
  type Verifier,
} from '@engagement-exchange/verification';
import { exitCodes, outcomeOf, usageError } from '../demo/follows.ts';

export const missingPool =
  'no verification account: pass --verification-account <handle> (repeatable) or set VERIFICATION_ACCOUNTS';

export const verificationPool = (
  flags: readonly string[],
  fromEnv: readonly string[],
): Result<Handle[], string> => {
  const values = flags.length > 0 ? flags : fromEnv;
  if (values.length === 0) return err(missingPool);
  const pool: Handle[] = [];
  for (const value of values) {
    const parsed = parseHandle('tiktok', value);
    if (!parsed.ok) return err(`invalid verification account ${value}: ${parsed.error.reason}`);
    pool.push(parsed.value);
  }
  return ok(pool);
};

export const resolvePool = async (
  verifier: Verifier,
  handles: readonly Handle[],
): Promise<VerificationCandidate[] | number> => {
  const candidates: VerificationCandidate[] = [];
  for (const handle of handles) {
    const verdict = await verifier.verify({ kind: 'profile', subject: handle });
    if (verdict.outcome !== 'verified') {
      console.error(
        `verification account @${handle.value}: ${outcomeOf(verdict.outcome, verdict.attempts)}`,
      );
      return exitCodes[verdict.outcome];
    }
    candidates.push({ handle, accountId: verdict.evidence.accountId });
  }
  return candidates;
};

export const emptyPool = 'no verification account: add one with pool add <handle>';

export const poolAdd = async (accounts: VerificationAccounts, account: Handle): Promise<number> => {
  const added = await accounts.addVerificationAccount({
    platform: account.platform,
    account: account.value,
  });
  if (!added.ok) {
    const { error } = added;
    if (error.kind === 'invalid_handle') {
      console.error(`invalid handle: ${account.value}`);
      return usageError;
    }
    const kind = error.sourceError === undefined ? '' : ` (${error.sourceError})`;
    console.error(`profile @${account.value}: ${error.outcome}${kind}`);
    return exitCodes[error.outcome];
  }
  if (added.value.status === 'inactive') {
    console.error(
      `@${account.value} is in the verification pool but inactive: it is never assigned`,
    );
    return 1;
  }
  console.log(
    added.value.status === 'added'
      ? `@${account.value} added to the verification pool`
      : `@${account.value} is already in the verification pool`,
  );
  return 0;
};

const named = (account: PooledAccount): string =>
  account.handle === undefined
    ? `account id ${account.accountId.value}`
    : `@${account.handle.value}`;

export const poolList = async (accounts: VerificationAccounts): Promise<number> => {
  const pooled = await accounts.listVerificationAccounts({ platform: 'tiktok' });
  if (pooled.length === 0) console.log(emptyPool);
  for (const account of pooled) {
    console.log(
      `${named(account)}  ${account.active ? 'active' : 'inactive'}  assigned ${String(account.assignedCount)}`,
    );
  }
  return 0;
};
