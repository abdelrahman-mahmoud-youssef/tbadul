import { failed } from '../../domain/answer.ts';
import type { CheckKind } from '../../domain/check.ts';
import type { Cost, CostUnit } from '../../domain/outcome.ts';
import type { SourceName } from '../../domain/source-name.ts';
import type { Clock } from '../../ports/clock.ts';
import type { SpendLedger } from '../../ports/spend-ledger.ts';
import type {
  CallContext,
  SourceAnswer,
  SourceCheckOf,
  VerificationSource,
} from '../../ports/verification-source.ts';

export interface DailyBudget {
  readonly unit: CostUnit;
  readonly daily: number;
}

export type BudgetReached = (source: SourceName, day: string) => void;

export interface BudgetDeps {
  readonly ledger?: SpendLedger;
  readonly clock: Clock;
  readonly onReached: BudgetReached;
}

interface DaySpend {
  readonly day: string;
  readonly seeded: Promise<number>;
  spent: number;
  reserved: number;
  warned: boolean;
}

const dayMs = 86_400_000;

const costOf = (answer: SourceAnswer<CheckKind>): Cost | undefined =>
  'answers' in answer ? answer.answers[0]?.cost : answer.cost;

export const withBudget = (
  source: VerificationSource,
  budget: DailyBudget,
  deps: BudgetDeps,
): VerificationSource => {
  let current: DaySpend | undefined;
  const spendOn = (now: number): DaySpend => {
    const dayStart = Math.floor(now / dayMs) * dayMs;
    const day = new Date(dayStart).toISOString().slice(0, 10);
    if (current?.day !== day) {
      current = {
        day,
        seeded: deps.ledger?.spentSince(source.name, budget.unit, dayStart) ?? Promise.resolve(0),
        spent: 0,
        reserved: 0,
        warned: false,
      };
    }
    return current;
  };
  const refuse = (spend: DaySpend, message: string) => {
    if (!spend.warned) {
      spend.warned = true;
      deps.onReached(source.name, spend.day);
    }
    return failed({ kind: 'budget', message });
  };
  return {
    name: source.name,
    platform: source.platform,
    supports: source.supports,
    answer: async <K extends CheckKind>(
      check: SourceCheckOf<K>,
      context: CallContext,
    ): Promise<SourceAnswer<K>> => {
      const spend = spendOn(deps.clock.now());
      const seeded = await spend.seeded.catch(() => undefined);
      if (seeded === undefined) {
        return refuse(spend, `${source.name} spend for ${spend.day} could not be read`);
      }
      if (seeded + spend.spent + spend.reserved >= budget.daily) {
        return refuse(
          spend,
          `${source.name} reached its daily budget of ${String(budget.daily)} ${budget.unit}`,
        );
      }
      spend.reserved += 1;
      try {
        const answer = await source.answer(check, context);
        const cost = costOf(answer);
        if (cost?.unit === budget.unit) spend.spent += cost.amount;
        return answer;
      } finally {
        spend.reserved -= 1;
      }
    },
  };
};
