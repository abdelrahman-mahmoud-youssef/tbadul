import {
  checkKinds as storedCheckKinds,
  checkOutcomes,
  costUnits as storedCostUnits,
  sourceErrorKinds as storedSourceErrorKinds,
} from '@engagement-exchange/db';
import { describe, expect, it } from 'vitest';
import { checkKinds } from '../../domain/check.ts';
import { costUnits, outcomes, sourceErrorKinds } from '../../domain/outcome.ts';

const sorted = (values: readonly string[]) => [...values].sort();

describe('database check constraints', () => {
  it.each([
    ['check kinds', storedCheckKinds, checkKinds],
    ['outcomes', checkOutcomes, outcomes],
    ['source error kinds', storedSourceErrorKinds, sourceErrorKinds],
    ['cost units', storedCostUnits, costUnits],
  ])('allow exactly the %s of the domain', (_name, stored, domain) => {
    expect(sorted(stored)).toEqual(sorted(domain));
  });
});
