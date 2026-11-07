import type { CostUnit } from '../domain/outcome.ts';
import type { SourceName } from '../domain/source-name.ts';

export interface SpendLedger {
  spentSince(source: SourceName, unit: CostUnit, since: number): Promise<number>;
}
