import type { AccountId } from './account-id.ts';
import type { CheckKind } from './check.ts';

export interface ProfileEvidence {
  readonly accountId: AccountId;
  readonly bio: string;
  readonly isPrivate: boolean;
  readonly followingVisible?: boolean;
  readonly likesVisible?: boolean;
  readonly followerCount?: number;
  readonly followingCount?: number;
  readonly videoCount?: number;
  readonly avatarUrl?: string;
  readonly createdAt?: number;
  readonly latestPostAt?: number;
}

export interface ListEvidence {
  readonly pagesRead: number;
  readonly listExhausted: boolean;
  readonly entriesRead: number;
}

type EvidenceForEveryKind<T extends Record<CheckKind, unknown>> = T;

export type EvidenceByKind = EvidenceForEveryKind<{
  readonly profile: ProfileEvidence;
  readonly follows: ListEvidence;
  readonly liked: ListEvidence;
}>;
