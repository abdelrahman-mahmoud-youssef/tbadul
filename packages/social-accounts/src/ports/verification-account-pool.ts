import type { Handle, Platform } from '@engagement-exchange/verification';

export interface VerificationAccountPool {
  candidates(platform: Platform): Promise<readonly Handle[]>;
  recordAssignment(account: Handle): Promise<void>;
}
