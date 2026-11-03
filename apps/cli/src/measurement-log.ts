import { createHmac } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import {
  err,
  ok,
  type Attempt,
  type MeasurementSink,
  type PlatformScoped,
  type Result,
} from '@engagement-exchange/verification';
import type { Env } from './config.ts';
import type { Demo } from './demo.ts';

export const missingKey =
  'config MEASUREMENT_HMAC_KEY: required by profile, owns, follows, liked and watch';

interface Subjects {
  readonly performer: PlatformScoped;
  readonly target?: PlatformScoped;
}

const subjectsOf = (demo: Demo): Subjects => {
  switch (demo.command) {
    case 'profile':
    case 'owns':
      return { performer: demo.subject };
    case 'follows':
    case 'watch':
      return { performer: demo.performer, target: demo.target };
    case 'liked':
      return { performer: demo.performer, target: demo.content };
  }
};

const line = (key: string, demo: Demo, attempt: Attempt): string => {
  const digest = (scoped: PlatformScoped) =>
    createHmac('sha256', key).update(scoped.value).digest('hex');
  const { performer, target } = subjectsOf(demo);
  const { error } = attempt;
  return JSON.stringify({
    at: new Date(attempt.startedAt).toISOString(),
    command: demo.command,
    check: attempt.check,
    source: attempt.source,
    outcome: attempt.outcome,
    latencyMs: attempt.latencyMs,
    cost: attempt.cost ?? null,
    ...(error && { errorKind: error.kind }),
    ...(error?.httpStatus !== undefined && { httpStatus: error.httpStatus }),
    ...(error?.providerStatus !== undefined && { providerStatus: error.providerStatus }),
    performer: digest(performer),
    ...(target && { target: digest(target) }),
  });
};

export const measurementLog = (env: Env, demo: Demo): Result<MeasurementSink, string> => {
  const key = env.MEASUREMENT_HMAC_KEY;
  if (key === undefined) return err(missingKey);
  return ok({
    record: (attempt) => {
      appendFileSync(env.MEASUREMENT_LOG_FILE, `${line(key, demo, attempt)}\n`);
    },
  });
};
