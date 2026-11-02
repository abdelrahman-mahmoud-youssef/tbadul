export interface ProfileFacts {
  readonly isPrivate: boolean;
  readonly followingVisible?: boolean;
  readonly followerCount?: number;
  readonly videoCount?: number;
  readonly avatarUrl?: string;
  readonly createdAt?: number;
  readonly latestPostAt?: number;
}
