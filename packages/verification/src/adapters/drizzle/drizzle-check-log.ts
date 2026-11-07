import { createHmac } from 'node:crypto';
import { verificationChecks, type Database } from '@engagement-exchange/db';
import type { Attempt } from '../../domain/attempt.ts';
import type { PlatformScoped } from '../../domain/platform-scoped.ts';

export interface CheckSubjects {
  readonly subject?: PlatformScoped;
  readonly performer?: PlatformScoped;
  readonly target?: PlatformScoped;
}

export interface CheckLog {
  append(attempt: Attempt, subjects: CheckSubjects): Promise<void>;
}

export const drizzleCheckLog = (db: Database, hmacKey?: string): CheckLog => {
  const digest = (scoped: PlatformScoped | undefined) =>
    scoped === undefined || hmacKey === undefined
      ? null
      : createHmac('sha256', hmacKey).update(scoped.value).digest('hex');
  return {
    append: async (attempt, { subject, performer, target }) => {
      await db.insert(verificationChecks).values({
        at: new Date(attempt.startedAt),
        checkKind: attempt.check,
        platform: attempt.platform,
        source: attempt.source,
        outcome: attempt.outcome,
        errorKind: attempt.error?.kind ?? null,
        latencyMs: attempt.latencyMs,
        costUnit: attempt.cost?.unit ?? null,
        costAmount: attempt.cost === undefined ? null : String(attempt.cost.amount),
        subjectHash: digest(subject),
        performerHash: digest(performer),
        targetHash: digest(target),
      });
    },
  };
};
