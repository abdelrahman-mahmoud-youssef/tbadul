import type {
  AccountId,
  Attempt,
  BioToken,
  ContentId,
  Handle,
  Outcome,
  ProfileEvidence,
  Verifier,
} from '@engagement-exchange/verification';

export const exitCodes: Readonly<Record<Outcome, number>> = {
  verified: 0,
  not_following: 1,
  private: 2,
  not_found: 3,
  source_error: 4,
};

export const usageError = 64;

const measured = (attempts: readonly Attempt[]): string => {
  const latency = attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0);
  const spent = (unit: string) =>
    attempts.reduce(
      (sum, attempt) => sum + (attempt.cost?.unit === unit ? attempt.cost.amount : 0),
      0,
    );
  const units = spent('units');
  return `latency ${String(latency)} ms, requests ${String(spent('request'))}${units > 0 ? `, units ${String(units)}` : ''}`;
};

export const cacheUse = (attempts: readonly Attempt[]): string | undefined => {
  const profiles = attempts.filter((attempt) => attempt.check === 'profile');
  if (profiles.length === 0) return undefined;
  const hits = profiles.filter((attempt) => attempt.source === 'cache').length;
  return `profile cache hits ${String(hits)}, misses ${String(profiles.length - hits)}`;
};

export const outcomeOf = (outcome: Outcome, attempts: readonly Attempt[]): string => {
  const kind = attempts.at(-1)?.error?.kind;
  return outcome === 'source_error' && kind !== undefined ? `${outcome} (${kind})` : outcome;
};

const finish = (
  label: string,
  outcome: Outcome,
  attempts: readonly Attempt[],
  details: readonly string[] = [],
): number => {
  console.log(`${label}: ${outcomeOf(outcome, attempts)}`);
  for (const detail of details) console.log(`  ${detail}`);
  console.log(measured(attempts));
  return exitCodes[outcome];
};

const visibility = (visible: boolean | undefined): string =>
  visible === undefined ? 'unknown' : visible ? 'visible' : 'hidden';

const describeProfile = (evidence: ProfileEvidence): string[] => {
  const counts = Object.entries({
    followers: evidence.followerCount,
    following: evidence.followingCount,
    videos: evidence.videoCount,
  }).flatMap(([label, count]) => (count === undefined ? [] : [`${label} ${String(count)}`]));
  return [
    `account id ${evidence.accountId.value}`,
    `private ${evidence.isPrivate ? 'yes' : 'no'}, following ${visibility(evidence.followingVisible)}, likes ${visibility(evidence.likesVisible)}`,
    ...(counts.length > 0 ? [counts.join(', ')] : []),
    ...(evidence.createdAt === undefined
      ? []
      : [`created ${new Date(evidence.createdAt).toISOString()}`]),
  ];
};

export const profileCommand = async (
  verifier: Verifier,
  attempts: readonly Attempt[],
  subject: Handle,
): Promise<number> => {
  const verdict = await verifier.verify({ kind: 'profile', subject });
  return finish(
    `profile @${subject.value}`,
    verdict.outcome,
    attempts,
    verdict.outcome === 'verified' ? describeProfile(verdict.evidence) : [],
  );
};

export const ownsCommand = async (
  verifier: Verifier,
  attempts: readonly Attempt[],
  subject: Handle,
  token: BioToken,
): Promise<number> => {
  const verdict = await verifier.verifyOwnership(subject, token);
  return finish(
    `@${subject.value} owns`,
    verdict.outcome,
    attempts,
    verdict.outcome === 'not_following' ? ['token absent from the bio'] : [],
  );
};

type Resolved =
  | { readonly ok: true; readonly evidence: ProfileEvidence }
  | { readonly ok: false; readonly outcome: Outcome };

const resolve = async (verifier: Verifier, subject: Handle): Promise<Resolved> => {
  const verdict = await verifier.verify({ kind: 'profile', subject });
  return verdict.outcome === 'verified'
    ? { ok: true, evidence: verdict.evidence }
    : { ok: false, outcome: verdict.outcome };
};

export const followsLabel = (performer: Handle, target: Handle): string =>
  `@${performer.value} follows @${target.value}`;

export interface ResolvedFollows {
  readonly performer: ProfileEvidence;
  readonly targetId: AccountId;
}

export const resolveFollows = async (
  verifier: Verifier,
  attempts: readonly Attempt[],
  performer: Handle,
  target: Handle,
): Promise<ResolvedFollows | number> => {
  const targetProfile = await resolve(verifier, target);
  if (!targetProfile.ok) {
    return finish(`target @${target.value}`, targetProfile.outcome, attempts);
  }
  const performerProfile = await resolve(verifier, performer);
  if (!performerProfile.ok) {
    return finish(`performer @${performer.value}`, performerProfile.outcome, attempts);
  }
  const { evidence } = performerProfile;
  if (evidence.isPrivate || evidence.followingVisible === false) {
    return finish(followsLabel(performer, target), 'private', attempts);
  }
  return { performer: evidence, targetId: targetProfile.evidence.accountId };
};

export const followsCommand = async (
  verifier: Verifier,
  attempts: readonly Attempt[],
  performer: Handle,
  target: Handle,
): Promise<number> => {
  const resolved = await resolveFollows(verifier, attempts, performer, target);
  if (typeof resolved === 'number') return resolved;
  const { performer: evidence, targetId } = resolved;
  const verdict = await verifier.verify({
    kind: 'follows',
    performer,
    performerId: evidence.accountId,
    ...(evidence.followingCount !== undefined && {
      performerFollowingCount: evidence.followingCount,
    }),
    target,
    targetId,
  });
  return finish(followsLabel(performer, target), verdict.outcome, attempts);
};

export const likedCommand = async (
  verifier: Verifier,
  attempts: readonly Attempt[],
  performer: Handle,
  content: ContentId,
): Promise<number> => {
  const label = `@${performer.value} liked ${content.value}`;
  const performerProfile = await resolve(verifier, performer);
  if (!performerProfile.ok) {
    return finish(`performer @${performer.value}`, performerProfile.outcome, attempts);
  }
  const { evidence } = performerProfile;
  if (evidence.isPrivate || evidence.likesVisible === false) {
    return finish(label, 'private', attempts);
  }
  const verdict = await verifier.verify({
    kind: 'liked',
    performer,
    performerId: evidence.accountId,
    content,
  });
  return finish(label, verdict.outcome, attempts);
};
