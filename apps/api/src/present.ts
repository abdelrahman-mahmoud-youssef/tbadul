import type {
  Claim,
  PlatformAccounts as PlatformAccountsBody,
  PooledAccount as PooledAccountBody,
} from '@engagement-exchange/contracts';
import type {
  AccountClaim,
  PlatformAccounts,
  PooledAccount,
} from '@engagement-exchange/social-accounts';
import { iso } from './errors.ts';

export const presentClaim = (claim: AccountClaim): Claim => ({
  id: claim.id,
  platform: claim.platform,
  handle: claim.handle.value,
  state: claim.state,
  ...(claim.verificationAccount !== undefined && {
    verificationAccount: { handle: claim.verificationAccount.value },
  }),
  eligibility: { eligible: claim.eligibility.eligible, results: [...claim.eligibility.results] },
  ...(claim.rejection !== undefined && { rejection: claim.rejection }),
  attempts: claim.attempts.map(({ at, outcome }) => ({ at: iso(at), outcome })),
  nextVerifyAt: iso(claim.nextVerifyAt),
  startedAt: iso(claim.startedAt),
  expiresAt: iso(claim.expiresAt),
});

export const presentPlatformAccounts = (accounts: PlatformAccounts): PlatformAccountsBody => ({
  platform: accounts.platform,
  limit: accounts.limit,
  used: accounts.used,
  accounts: accounts.accounts.map(({ handle, linkedAt, claimId }) => ({
    handle: handle.value,
    linkedAt: iso(linkedAt),
    claimId,
  })),
  openClaims: accounts.openClaims.map(presentClaim),
});

export const presentPooledAccount = (account: PooledAccount): PooledAccountBody => ({
  accountId: account.accountId.value,
  ...(account.handle !== undefined && { handle: account.handle.value }),
  active: account.active,
  assignedCount: account.assignedCount,
});
