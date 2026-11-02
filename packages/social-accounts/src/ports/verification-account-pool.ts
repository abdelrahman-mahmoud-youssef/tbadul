import type { Handle, Platform } from '@engagement-exchange/verification';

export interface VerificationAccountPool {
  candidates(platform: Platform): readonly Handle[];
}
