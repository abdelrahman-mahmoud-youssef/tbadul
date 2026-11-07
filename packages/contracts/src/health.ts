import { z } from 'zod';
import { sourceName } from './vocabulary.ts';

const order = z.array(sourceName);

export const healthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['up', 'down']),
  sources: z.object({
    configured: z.array(sourceName),
    leftOut: z.array(sourceName),
    orders: z.object({ profile: order, follows: order, liked: order }),
  }),
});
export type HealthResponse = z.infer<typeof healthResponse>;
