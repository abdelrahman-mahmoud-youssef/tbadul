import { useEffect, useState } from 'react';

export const useCountdown = (readyAt: number): number | null => {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      setRemaining(Math.max(0, readyAt - Date.now()));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [readyAt]);
  return remaining;
};

export const formatRemaining = (ms: number): string => {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
