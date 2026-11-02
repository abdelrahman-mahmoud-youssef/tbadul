export interface CooldownSchedule {
  readonly stepsMs: readonly number[];
  readonly afterwardsMs: number;
}

export const cooldownAfter = (failedAttempts: number, schedule: CooldownSchedule): number =>
  schedule.stepsMs[failedAttempts - 1] ?? schedule.afterwardsMs;
