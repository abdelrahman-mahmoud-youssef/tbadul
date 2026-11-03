import type { ClaimState } from './claim.ts';

export type ClaimError =
  | { readonly kind: 'invalid_handle'; readonly reason: string }
  | { readonly kind: 'claim_limit_reached'; readonly limit: number }
  | { readonly kind: 'account_already_claimed' }
  | { readonly kind: 'account_already_linked' }
  | { readonly kind: 'version_conflict' }
  | { readonly kind: 'claim_not_found' }
  | { readonly kind: 'claim_not_verifiable'; readonly state: ClaimState }
  | { readonly kind: 'claim_expired' }
  | { readonly kind: 'cooldown_active'; readonly retryAt: number; readonly waitMs: number }
  | { readonly kind: 'account_unavailable'; readonly outcome: 'private' | 'not_found' }
  | { readonly kind: 'source_unavailable' };
