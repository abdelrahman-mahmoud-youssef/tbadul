import {
  parseContentId,
  parseHandle,
  type Attempt,
  type Handle,
  type Outcome,
  type ProfileEvidence,
  type Verifier,
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

const outcomeOf = (outcome: Outcome, attempts: readonly Attempt[]): string => {
  const kind = attempts.at(-1)?.error?.kind;
  return outcome === 'source_error' && kind !== undefined ? `${outcome} (${kind})` : outcome;
};

const finish = (label: string, outcome: Outcome, attempts: readonly Attempt[]): number => {
  console.log(`${label}: ${outcomeOf(outcome, attempts)}`);
  console.log(measured(attempts));
  return exitCodes[outcome];
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

const handles = (inputs: readonly string[]): Handle[] | string => {
  const parsed: Handle[] = [];
  for (const input of inputs) {
    const result = parseHandle('tiktok', input);
    if (!result.ok) return input;
    parsed.push(result.value);
  }
  return parsed;
};

export const followsCommand = async (
  verifier: Verifier,
  attempts: readonly Attempt[],
  performerInput: string,
  targetInput: string,
): Promise<number> => {
  const parsed = handles([performerInput, targetInput]);
  if (typeof parsed === 'string') {
    console.error(`invalid handle: ${parsed}`);
    return usageError;
  }
  const [performer, target] = parsed as [Handle, Handle];
  const label = `@${performer.value} follows @${target.value}`;
  const targetProfile = await resolve(verifier, target);
  if (!targetProfile.ok && targetProfile.outcome !== 'private') {
    return finish(`target @${target.value}`, targetProfile.outcome, attempts);
  }
  const performerProfile = await resolve(verifier, performer);
  if (!performerProfile.ok) {
    return finish(`performer @${performer.value}`, performerProfile.outcome, attempts);
  }
  const { evidence } = performerProfile;
  if (evidence.isPrivate || evidence.followingVisible === false) {
    return finish(label, 'private', attempts);
  }
  const verdict = await verifier.verify({
    kind: 'follows',
    performer,
    performerId: evidence.accountId,
    target,
  });
  return finish(label, verdict.outcome, attempts);
};

export const likedCommand = async (
  verifier: Verifier,
  attempts: readonly Attempt[],
  performerInput: string,
  contentInput: string,
): Promise<number> => {
  const performer = parseHandle('tiktok', performerInput);
  const content = parseContentId('tiktok', contentInput);
  if (!performer.ok || !content.ok) {
    console.error(
      `invalid ${performer.ok ? 'content' : 'handle'}: ${performer.ok ? contentInput : performerInput}`,
    );
    return usageError;
  }
  const label = `@${performer.value.value} liked ${content.value.value}`;
  const performerProfile = await resolve(verifier, performer.value);
  if (!performerProfile.ok) {
    return finish(`performer @${performer.value.value}`, performerProfile.outcome, attempts);
  }
  const { evidence } = performerProfile;
  if (evidence.isPrivate || evidence.likesVisible === false) {
    return finish(label, 'private', attempts);
  }
  const verdict = await verifier.verify({
    kind: 'liked',
    performer: performer.value,
    performerId: evidence.accountId,
    content: content.value,
  });
  return finish(label, verdict.outcome, attempts);
};
