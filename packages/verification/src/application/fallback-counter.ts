import type { SourceName } from '../domain/source-name.ts';
import type { MeasurementSink } from '../ports/measurement-sink.ts';

const hourMs = 3_600_000;

export interface FallbackCount {
  readonly source: SourceName;
  readonly hour: string;
  readonly count: number;
}

export interface FallbackCounter extends MeasurementSink {
  counts(): readonly FallbackCount[];
}

export const fallbackCounter = (keepHours = 48): FallbackCounter => {
  const hours = new Map<number, Map<SourceName, number>>();
  return {
    record: (attempt) => {
      if (attempt.outcome !== 'source_error') return;
      const hour = Math.floor(attempt.startedAt / hourMs) * hourMs;
      for (const kept of hours.keys()) if (kept <= hour - keepHours * hourMs) hours.delete(kept);
      const bySource = hours.get(hour) ?? new Map<SourceName, number>();
      bySource.set(attempt.source, (bySource.get(attempt.source) ?? 0) + 1);
      hours.set(hour, bySource);
    },
    counts: () =>
      [...hours.entries()]
        .sort(([a], [b]) => a - b)
        .flatMap(([hour, bySource]) =>
          [...bySource.entries()].map(([source, count]) => ({
            source,
            hour: new Date(hour).toISOString(),
            count,
          })),
        ),
  };
};

export const allSinks = (...sinks: readonly MeasurementSink[]): MeasurementSink => ({
  record: (attempt) => {
    for (const sink of sinks) sink.record(attempt);
  },
});
