export const millisecondsUntil = (isoTime: string, now: number = Date.now()): number =>
  Math.max(0, Date.parse(isoTime) - now);
