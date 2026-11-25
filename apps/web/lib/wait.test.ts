import { describe, expect, it } from 'vitest';
import { millisecondsUntil } from './wait';

describe('millisecondsUntil', () => {
  const now = Date.parse('2026-11-25T15:57:00Z');

  it('is the time remaining until a future moment', () => {
    expect(millisecondsUntil('2026-11-25T15:57:30Z', now)).toBe(30_000);
  });

  it('is zero once the moment has passed', () => {
    expect(millisecondsUntil('2026-11-25T15:56:00Z', now)).toBe(0);
  });
});
