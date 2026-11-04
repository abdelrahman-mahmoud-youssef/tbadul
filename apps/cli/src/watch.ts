import type { Attempt, Clock, Handle, Verifier } from '@engagement-exchange/verification';
import { exitCodes, followsLabel, outcomeOf, resolveFollows } from './follows.ts';

export interface WatchPlan {
  readonly everySeconds: number;
  readonly times: number | undefined;
}

export interface WatchDeps {
  readonly sleep: (ms: number) => Promise<unknown>;
  readonly clock: Clock;
}

export const watchFollows = async (
  verifier: Verifier,
  attempts: readonly Attempt[],
  performer: Handle,
  target: Handle,
  plan: WatchPlan,
  deps: WatchDeps,
): Promise<number> => {
  const resolved = await resolveFollows(verifier, attempts, performer, target);
  if (typeof resolved === 'number') return resolved;
  const label = followsLabel(performer, target);
  let seenVerified = false;
  for (let run = 1; ; run += 1) {
    const verdict = await verifier.verify({
      kind: 'follows',
      performer,
      performerId: resolved.performer.accountId,
      target,
      targetId: resolved.targetId,
    });
    const at = new Date(deps.clock.now()).toISOString();
    console.log(`${at} ${label}: ${outcomeOf(verdict.outcome, verdict.attempts)}`);
    if (verdict.outcome === 'not_following' && seenVerified) {
      console.log(`@${performer.value} unfollowed @${target.value}`);
      return exitCodes.not_following;
    }
    seenVerified ||= verdict.outcome === 'verified';
    if (run === plan.times) return exitCodes[verdict.outcome];
    await deps.sleep(plan.everySeconds * 1000);
  }
};
