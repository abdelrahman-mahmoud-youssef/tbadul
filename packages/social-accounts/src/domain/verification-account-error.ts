import type { Outcome, SourceErrorKind } from '@engagement-exchange/verification';

export type AddVerificationAccountError =
  | { readonly kind: 'invalid_handle'; readonly reason: string }
  | {
      readonly kind: 'profile_unavailable';
      readonly outcome: Exclude<Outcome, 'verified'>;
      readonly sourceError?: SourceErrorKind;
    };

export interface VerificationAccountNotFound {
  readonly kind: 'verification_account_not_found';
}
