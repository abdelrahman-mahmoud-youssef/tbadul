import type { Attempt } from '../domain/attempt.ts';

export interface MeasurementSink {
  record(attempt: Attempt): void;
}
