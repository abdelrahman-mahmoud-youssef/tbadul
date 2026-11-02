import type { Attempt } from '../domain/attempt.ts';
import type { MeasurementSink } from '../ports/measurement-sink.ts';

export interface RecordingSink extends MeasurementSink {
  readonly attempts: readonly Attempt[];
}

export const recordingSink = (): RecordingSink => {
  const attempts: Attempt[] = [];
  return {
    attempts,
    record: (attempt) => {
      attempts.push(attempt);
    },
  };
};
