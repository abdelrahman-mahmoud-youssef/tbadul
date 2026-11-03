import type { AccountId, Handle, Platform } from '@engagement-exchange/verification';

export interface VerificationCandidate {
  readonly handle: Handle;
  readonly accountId?: AccountId;
}

export interface VerificationAccountPool {
  candidates(platform: Platform): Promise<readonly VerificationCandidate[]>;
  recordAssignment(account: AccountId): Promise<void>;
}
