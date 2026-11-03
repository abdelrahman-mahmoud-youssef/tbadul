import { err, ok, type Result } from '@engagement-exchange/verification';
import { z } from 'zod';

const split = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');

export const sourceNames = ['scraper', 'lamatok', 'ensemble'] as const;

export type CliSourceName = (typeof sourceNames)[number];

export const sourceChoices = [...sourceNames, 'chain'] as const;

export const sourceChoice = z.enum(sourceChoices).default('chain');

export type SourceChoice = z.infer<typeof sourceChoice>;

const order = z
  .string()
  .transform(split)
  .pipe(z.array(z.enum(sourceNames)).min(1))
  .optional();

export const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  TIKTOK_SIGNER_URL: z.url().default('http://localhost:8080'),
  LAMATOK_ACCESS_KEY: z.string().optional(),
  ENSEMBLEDATA_TOKEN: z.string().optional(),
  VERIFICATION_ACCOUNTS: z.string().default('').transform(split),
  VERIFICATION_SOURCE_ORDER: order,
  VERIFICATION_SOURCE_ORDER_PROFILE: order,
  VERIFICATION_SOURCE_ORDER_FOLLOWS: order,
  VERIFICATION_SOURCE_ORDER_LIKED: order,
  VERIFICATION_CONFIRM_NOT_FOLLOWING: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  OUTBOUND_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  CLI_USER_ID: z.string().min(1).default('local'),
  MEASUREMENT_LOG_FILE: z.string().min(1).default('measurements.jsonl'),
  MEASUREMENT_HMAC_KEY: z.string().optional(),
  WATCH_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
});

export type Env = z.infer<typeof envSchema>;

export const databaseUserId = z.uuid();

export const readEnv = (source: Record<string, string | undefined>): Result<Env, string[]> => {
  const parsed = envSchema.safeParse(
    Object.fromEntries(Object.entries(source).filter(([, value]) => value !== '')),
  );
  return parsed.success
    ? ok(parsed.data)
    : err(parsed.error.issues.map((issue) => `config ${issue.path.join('.')}: ${issue.message}`));
};
