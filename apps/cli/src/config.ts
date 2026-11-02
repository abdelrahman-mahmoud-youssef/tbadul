import { z } from 'zod';

const list = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== ''),
    );

export const envSchema = z.object({
  TIKTOK_SIGNER_URL: z.url(),
  VERIFICATION_ACCOUNTS: list(''),
  VERIFICATION_SOURCE_ORDER: list('scraper'),
  OUTBOUND_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  CLAIMS_FILE: z.string().min(1).default('claims.local.json'),
  CLI_USER_ID: z.string().min(1).default('local'),
});

export type Env = z.infer<typeof envSchema>;

export const readEnv = (source: Record<string, string | undefined>): Env => envSchema.parse(source);
