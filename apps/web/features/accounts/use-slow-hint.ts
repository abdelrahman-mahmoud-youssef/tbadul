import { useEffect, useState } from 'react';

export const useSlowHint = (active: boolean, afterMs: number): boolean => {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      setSlow(true);
    }, afterMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active, afterMs]);
  return slow;
};
