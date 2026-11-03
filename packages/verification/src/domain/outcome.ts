export const outcomes = [
  'verified',
  'not_following',
  'private',
  'not_found',
  'source_error',
] as const;

export type Outcome = (typeof outcomes)[number];

export const sourceErrorKinds = [
  'timeout',
  'network',
  'http',
  'auth',
  'rate_limited',
  'blocked',
  'parse',
  'unknown_status',
  'incomplete_list',
  'unexpected',
] as const;

export type SourceErrorKind = (typeof sourceErrorKinds)[number];

export interface SourceError {
  readonly kind: SourceErrorKind;
  readonly message: string;
  readonly httpStatus?: number;
  readonly providerStatus?: number;
}

export type CostUnit = 'request' | 'units' | 'usd';

export interface Cost {
  readonly unit: CostUnit;
  readonly amount: number;
}
