import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRemaining, useCooldown } from './use-cooldown';

describe('useCooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down the wait the server asked for', () => {
    const { result } = renderHook(() => useCooldown(30_000));

    expect(result.current.remaining).toBe(30_000);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.remaining).toBe(20_000);
    expect(result.current.total).toBe(30_000);
  });

  it('is ready once the wait is over', () => {
    const { result } = renderHook(() => useCooldown(2000));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.remaining).toBe(0);
  });

  it('starts a new wait on request', () => {
    const { result } = renderHook(() => useCooldown(0));

    act(() => {
      result.current.start(45_000);
    });

    expect(result.current.remaining).toBe(45_000);
    expect(result.current.total).toBe(45_000);
  });

  it('keeps its own deadline when the server repeats nearly the same wait', () => {
    const { result, rerender } = renderHook(({ ms }) => useCooldown(ms), {
      initialProps: { ms: 30_000 },
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    rerender({ ms: 19_500 });

    expect(result.current.total).toBe(30_000);
    expect(result.current.remaining).toBe(20_000);
  });
});

describe('formatRemaining', () => {
  it('shows minutes and padded seconds', () => {
    expect(formatRemaining(19_200)).toBe('0:20');
    expect(formatRemaining(65_000)).toBe('1:05');
  });
});
