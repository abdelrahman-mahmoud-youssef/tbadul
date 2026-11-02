declare const brand: unique symbol;

type Branded<T, Name extends string> = T & { readonly [brand]: Name };

export type UserId = Branded<string, 'UserId'>;

export type ClaimId = Branded<string, 'ClaimId'>;

export const userId = (value: string): UserId => value as UserId;

export const claimId = (value: string): ClaimId => value as ClaimId;
