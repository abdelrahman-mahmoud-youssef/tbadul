import { useCallback, useEffect, useRef, useState } from 'react';

interface Deadline {
  readonly endsAt: number;
  readonly total: number;
}

export interface CooldownState {
  readonly remaining: number | null;
  readonly total: number;
  readonly endsAt: number;
  readonly start: (ms: number) => void;
}

const resyncToleranceMs = 2000;
const tickMs = 250;

export const useCooldown = (initialMs: number): CooldownState => {
  const deadline = useRef<Deadline | null>(null);
  const [state, setState] = useState<Omit<CooldownState, 'start'>>({
    remaining: null,
    total: 0,
    endsAt: 0,
  });

  const publish = useCallback(() => {
    const current = deadline.current;
    if (current === null) return;
    const remaining = Math.max(0, current.endsAt - Date.now());
    setState((previous) =>
      previous.remaining === remaining && previous.endsAt === current.endsAt
        ? previous
        : { remaining, total: current.total, endsAt: current.endsAt },
    );
  }, []);

  const start = useCallback(
    (ms: number) => {
      deadline.current = { endsAt: Date.now() + ms, total: ms };
      publish();
    },
    [publish],
  );

  useEffect(() => {
    const endsAt = Date.now() + initialMs;
    const current = deadline.current;
    if (current === null || Math.abs(current.endsAt - endsAt) >= resyncToleranceMs) {
      deadline.current = { endsAt, total: initialMs };
    }
    publish();
    const timer = setInterval(publish, tickMs);
    return () => {
      clearInterval(timer);
    };
  }, [initialMs, publish]);

  return { ...state, start };
};

export const formatRemaining = (ms: number): string => {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
