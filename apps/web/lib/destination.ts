import { z } from 'zod';

const localPath = z
  .string()
  .regex(/^\/(?![/\\])/)
  .max(512);

export const destinationOf = (next: string | string[] | undefined, fallback: string): string => {
  const parsed = localPath.safeParse(next);
  return parsed.success ? parsed.data : fallback;
};
