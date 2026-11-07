import type * as contract from '@engagement-exchange/contracts';
import type { UserRole } from '@engagement-exchange/db';
import type {
  ClaimState,
  FailedAttemptOutcome,
  PoolAddition,
  ReasonCode,
  RejectionReason,
  RuleName,
  RuleResult,
  VerifyOutcome,
} from '@engagement-exchange/social-accounts';
import type { KnownSourceName, Platform } from '@engagement-exchange/verification';
import { describe, expectTypeOf, it } from 'vitest';

describe('the contract vocabulary', () => {
  it('equals the domain vocabulary', () => {
    expectTypeOf<contract.Platform>().toEqualTypeOf<Platform>();
    expectTypeOf<contract.ClaimState>().toEqualTypeOf<ClaimState>();
    expectTypeOf<contract.RuleName>().toEqualTypeOf<RuleName>();
    expectTypeOf<contract.RuleResult>().toEqualTypeOf<RuleResult['result']>();
    expectTypeOf<contract.ReasonCode>().toEqualTypeOf<ReasonCode>();
    expectTypeOf<contract.VerifyOutcome>().toEqualTypeOf<Exclude<VerifyOutcome, 'source_error'>>();
    expectTypeOf<contract.FailedAttemptOutcome>().toEqualTypeOf<FailedAttemptOutcome>();
    expectTypeOf<contract.RejectionReason>().toEqualTypeOf<RejectionReason>();
    expectTypeOf<contract.PoolAddition>().toEqualTypeOf<PoolAddition>();
    expectTypeOf<contract.UserRole>().toEqualTypeOf<UserRole>();
    expectTypeOf<contract.SourceName>().toEqualTypeOf<KnownSourceName>();
  });
});
