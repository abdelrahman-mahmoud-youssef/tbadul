import { err, ok, type Result } from '@engagement-exchange/verification';
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

export const sourceNames = ['scraper'] as const;

export const envSchema = z.object({
  TIKTOK_SIGNER_URL: z.url().default('http://localhost:8080'),
  VERIFICATION_ACCOUNTS: list(''),
  VERIFICATION_SOURCE_ORDER: list('scraper').pipe(z.array(z.enum(sourceNames)).min(1)),
  OUTBOUND_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  CLAIMS_FILE: z.string().min(1).default('claims.local.json'),
  CLI_USER_ID: z.string().min(1).default('local'),
});

export type Env = z.infer<typeof envSchema>;

export const readEnv = (source: Record<string, string | undefined>): Result<Env, string[]> => {
  const parsed = envSchema.safeParse(
    Object.fromEntries(Object.entries(source).filter(([, value]) => value !== '')),
  );
  return parsed.success
    ? ok(parsed.data)
    : err(parsed.error.issues.map((issue) => `config ${issue.path.join('.')}: ${issue.message}`));
};
