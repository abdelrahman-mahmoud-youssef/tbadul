import {
  claimId,
  userId,
  type AccountClaim,
  type ClaimError,
  type SocialAccounts,
  type VerifyResult,
} from '@engagement-exchange/social-accounts';
import type { Result } from '@engagement-exchange/verification';

const when = (ms: number): string => new Date(ms).toISOString();

const refusal = (claim: AccountClaim): string =>
  claim.rejection === 'pool_exhausted'
    ? `@${claim.handle.value} already follows every verification account given`
    : 'another user holds this account';

export const describeClaim = (claim: AccountClaim): string[] => [
  `claim ${claim.id}: ${claim.state} for @${claim.handle.value} on ${claim.platform}`,
  ...claim.eligibility.results.map(
    (result) =>
      `  ${result.rule}: ${result.result}${result.result === 'pass' ? '' : ` (${result.reason})`}`,
  ),
  ...(claim.verificationAccount
    ? [
        `follow @${claim.verificationAccount.value} from @${claim.handle.value}, then run link verify ${claim.id}`,
      ]
    : []),
  ...(claim.rejection ? [`refused: ${refusal(claim)}`] : []),
  ...(claim.state === 'eligibility_failed'
    ? ['refused: the account fails an eligibility rule']
    : []),
  `attempts: ${String(claim.attempts.length)}; next verify allowed at ${when(claim.nextVerifyAt)}; expires ${when(claim.expiresAt)}`,
];

export const describeError = (error: ClaimError): string => {
  switch (error.kind) {
    case 'cooldown_active':
      return `too early: next verify allowed at ${when(error.retryAt)} (${String(Math.ceil(error.waitMs / 1000))} s)`;
    case 'claim_limit_reached':
      return `limit reached: at most ${String(error.limit)} accounts per platform`;
    case 'invalid_handle':
      return `invalid handle: ${error.reason}`;
    case 'account_unavailable':
      return `account unavailable: ${error.outcome}`;
    case 'claim_not_verifiable':
      return `claim is ${error.state}, nothing to verify`;
    case 'account_already_linked':
      return 'you have already linked this account';
    case 'version_conflict':
      return 'the claim changed while this command ran: run it again';
    default:
      return error.kind.replaceAll('_', ' ');
  }
};

const report = <T>(result: Result<T, ClaimError>, lines: (value: T) => string[]): number => {
  if (!result.ok) {
    console.error(describeError(result.error));
    return 1;
  }
  for (const line of lines(result.value)) console.log(line);
  return 0;
};

const refused = new Set(['rejected', 'eligibility_failed']);

export const linkStart = async (
  social: SocialAccounts,
  user: string,
  account: string,
): Promise<number> => {
  const result = await social.startAccountClaim({
    userId: userId(user),
    platform: 'tiktok',
    account,
  });
  const code = report(result, describeClaim);
  return result.ok && refused.has(result.value.state) ? 1 : code;
};

export const linkVerify = async (
  social: SocialAccounts,
  user: string,
  id: string,
): Promise<number> => {
  const result = await social.verifyAccountClaim({ userId: userId(user), claimId: claimId(id) });
  const code = report(result, ({ claim, outcome }: VerifyResult) => [
    `verify: ${outcome}`,
    ...describeClaim(claim),
  ]);
  return code === 0 && result.ok && result.value.outcome !== 'verified' ? 1 : code;
};
