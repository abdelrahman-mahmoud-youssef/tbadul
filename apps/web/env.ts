import { z } from 'zod';

export const env = z
  .object({
    API_ORIGIN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .url({ protocol: /^https?$/ })
        .default('http://127.0.0.1:4000')
        .transform((url) => new URL(url).origin),
    ),
  })
  .parse({ API_ORIGIN: process.env['API_ORIGIN'] });
