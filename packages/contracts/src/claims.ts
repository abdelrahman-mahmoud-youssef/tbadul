import { z } from 'zod';
import {
  claimState,
  failedAttemptOutcome,
  isoTime,
  platform,
  reasonCode,
  rejectionReason,
  ruleName,
  ruleResult,
  verifyOutcome,
} from './vocabulary.ts';

export const accountInput = z.string().trim().min(1).max(200);

export const ruleReport = z.object({
  rule: ruleName,
  result: ruleResult,
  reason: reasonCode.optional(),
});
export type RuleReport = z.infer<typeof ruleReport>;

export const eligibilityReport = z.object({
  eligible: z.boolean(),
  results: z.array(ruleReport),
});
export type EligibilityReport = z.infer<typeof eligibilityReport>;

export const claimAttempt = z.object({ at: isoTime, outcome: failedAttemptOutcome });
export type ClaimAttempt = z.infer<typeof claimAttempt>;

export const claim = z.object({
  id: z.uuid(),
  platform,
  handle: z.string(),
  state: claimState,
  verificationAccount: z.object({ handle: z.string() }).optional(),
  eligibility: eligibilityReport,
  rejection: rejectionReason.optional(),
  attempts: z.array(claimAttempt),
  nextVerifyAt: isoTime,
  startedAt: isoTime,
  expiresAt: isoTime,
});
export type Claim = z.infer<typeof claim>;

export const claimIdParam = z.uuid();

export const startClaimRequest = z.object({ platform, account: accountInput });
export type StartClaimRequest = z.infer<typeof startClaimRequest>;

export const claimResponse = z.object({ claim });
export type ClaimResponse = z.infer<typeof claimResponse>;

export const verifyClaimResponse = z.object({
  outcome: verifyOutcome,
  claim,
  nextAllowedAt: isoTime,
});
export type VerifyClaimResponse = z.infer<typeof verifyClaimResponse>;
