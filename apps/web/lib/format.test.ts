import { describe, expect, it } from 'vitest';
import { formatDateTime, formatNumber } from './format';

describe('formatters', () => {
  it('write numbers in Arabic with Western digits', () => {
    expect(formatNumber(1234567)).toMatch(/^1[^\d]?234[^\d]?567$/);
  });

  it('write dates with Western digits', () => {
    expect(formatDateTime('2026-11-07T10:30:00Z')).toMatch(/2026/);
    expect(formatDateTime('2026-11-07T10:30:00Z')).not.toMatch(/[٠-٩]/);
  });
});
