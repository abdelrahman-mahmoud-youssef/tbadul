import type { AccountId } from '../domain/account-id.ts';
import type { ProfileEvidence } from '../domain/evidence.ts';
import type { Handle } from '../domain/handle.ts';
import type { SourceName } from '../domain/source-name.ts';

export interface ProfileEntry {
  readonly handle: Handle;
  readonly evidence: ProfileEvidence;
  readonly source: SourceName;
  readonly fetchedAt: number;
}

export type CachedProfile = {
  readonly handle: Handle | null;
  readonly handleSeenAt: number | null;
} & (
  { readonly evidence: ProfileEvidence; readonly fetchedAt: number } | { readonly fetchedAt: null }
);

export interface ProfileCache {
  byId(accountId: AccountId): Promise<CachedProfile | undefined>;
  byHandle(handle: Handle): Promise<readonly CachedProfile[]>;
  store(entry: ProfileEntry): Promise<void>;
}
