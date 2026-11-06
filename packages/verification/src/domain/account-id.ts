import type { Branded } from './brand.ts';
import type { Platform } from './platform.ts';
import type { PlatformScoped } from './platform-scoped.ts';

export type AccountId = Branded<PlatformScoped & { readonly numericId?: string }, 'AccountId'>;

export const accountId = (platform: Platform, value: string, numericId?: string): AccountId =>
  (numericId === undefined ? { platform, value } : { platform, value, numericId }) as AccountId;

export interface ListedAccount {
  readonly value?: string;
  readonly numericId?: string;
}

export type AccountMatch = 'same' | 'other' | 'conflict' | 'unknown';

export const matchAccount = (target: AccountId, entry: ListedAccount): AccountMatch => {
  const comparable = [
    [target.value, entry.value],
    [target.numericId, entry.numericId],
  ].filter(([known, listed]) => known !== undefined && listed !== undefined);
  if (comparable.length === 0) return 'unknown';
  const agreeing = comparable.filter(([known, listed]) => known === listed).length;
  if (agreeing === comparable.length) return 'same';
  return agreeing === 0 ? 'other' : 'conflict';
};
