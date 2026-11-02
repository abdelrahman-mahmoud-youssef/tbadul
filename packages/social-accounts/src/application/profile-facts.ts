import type { ProfileEvidence } from '@engagement-exchange/verification';
import type { ProfileFacts } from '../domain/profile-facts.ts';

export const factsFrom = (evidence: ProfileEvidence): ProfileFacts => ({
  isPrivate: evidence.isPrivate,
  ...(evidence.followingVisible !== undefined && { followingVisible: evidence.followingVisible }),
  ...(evidence.followerCount !== undefined && { followerCount: evidence.followerCount }),
  ...(evidence.videoCount !== undefined && { videoCount: evidence.videoCount }),
  ...(evidence.avatarUrl !== undefined && { avatarUrl: evidence.avatarUrl }),
  ...(evidence.createdAt !== undefined && { createdAt: evidence.createdAt }),
  ...(evidence.latestPostAt !== undefined && { latestPostAt: evidence.latestPostAt }),
});
