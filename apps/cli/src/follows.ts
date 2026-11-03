import {
  parseHandle,
  type Attempt,
  type Outcome,
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
  const requests = attempts.reduce(
    (sum, attempt) => sum + (attempt.cost?.unit === 'request' ? attempt.cost.amount : 0),
    0,
  );
  return `latency ${String(latency)} ms, requests ${String(requests)}`;
};

const outcomeOf = (outcome: Outcome, attempts: readonly Attempt[]): string => {
  const kind = attempts.at(-1)?.error?.kind;
  return outcome === 'source_error' && kind !== undefined ? `${outcome} (${kind})` : outcome;
};

export const followsCommand = async (
  verifier: Verifier,
  attempts: readonly Attempt[],
  performerInput: string,
  targetInput: string,
): Promise<number> => {
  const performer = parseHandle('tiktok', performerInput);
  const target = parseHandle('tiktok', targetInput);
  if (!performer.ok || !target.ok) {
    const invalid = performer.ok ? targetInput : performerInput;
    console.error(`invalid handle: ${invalid}`);
    return usageError;
  }
  const resolved = await verifier.verify({ kind: 'profile', subject: target.value });
  if (resolved.outcome === 'not_found' || resolved.outcome === 'source_error') {
    console.log(`target @${target.value.value}: ${outcomeOf(resolved.outcome, attempts)}`);
    console.log(measured(attempts));
    return exitCodes[resolved.outcome];
  }
  const verdict = await verifier.verify({
    kind: 'follows',
    performer: performer.value,
    target: target.value,
  });
  console.log(
    `@${performer.value.value} follows @${target.value.value}: ${outcomeOf(verdict.outcome, attempts)}`,
  );
  console.log(measured(attempts));
  return exitCodes[verdict.outcome];
};
