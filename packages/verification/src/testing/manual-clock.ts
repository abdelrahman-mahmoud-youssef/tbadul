import type { Clock } from '../ports/clock.ts';

export interface ManualClock extends Clock {
  advance(ms: number): void;
}

export const manualClock = (start = 1_700_000_000_000): ManualClock => {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
};
