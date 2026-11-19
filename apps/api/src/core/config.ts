import { knownSourceNames } from '@engagement-exchange/verification';
import { z } from 'zod';

const list = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');

const order = z
  .string()
  .transform(list)
  .pipe(z.array(z.enum(knownSourceNames)).min(1))
  .optional();

const positiveInt = z.coerce.number().int().positive();

export const envSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  BETTER_AUTH_SECRET: z.string().min(32),
  PUBLIC_WEB_ORIGIN: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform(list)
    .pipe(z.array(z.url().transform((url) => new URL(url).origin))),
  TIKTOK_SIGNER_URL: z.url().default('http://localhost:8080'),
  LAMATOK_ACCESS_KEY: z.string().optional(),
  ENSEMBLEDATA_TOKEN: z.string().optional(),
  ENSEMBLEDATA_TOKENS: z.string().default('').transform(list),
  SCRAPTIK_RAPIDAPI_KEY: z.string().optional(),
  VERIFICATION_SOURCE_ORDER: order,
  VERIFICATION_SOURCE_ORDER_PROFILE: order,
  VERIFICATION_SOURCE_ORDER_FOLLOWS: order,
  VERIFICATION_SOURCE_ORDER_LIKED: order,
  VERIFICATION_CONFIRM_NOT_FOLLOWING: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  VERIFICATION_CONCURRENCY: positiveInt.default(4),
  VERIFICATION_QUEUE: z.coerce.number().int().nonnegative().default(32),
  ENSEMBLEDATA_DAILY_UNITS: z.coerce.number().positive().optional(),
  SCRAPTIK_DAILY_REQUESTS: z.coerce.number().positive().optional(),
  LAMATOK_DAILY_REQUESTS: z.coerce.number().positive().optional(),
  OUTBOUND_TIMEOUT_MS: positiveInt.default(15_000),
  MEASUREMENT_HMAC_KEY: z.string().optional(),
  RATE_LIMIT_MAX: positiveInt.default(10),
  RATE_LIMIT_WINDOW_MS: positiveInt.default(60_000),
});

export type Env = z.infer<typeof envSchema>;

export const readEnv = (source: Readonly<Record<string, string | undefined>>) =>
  envSchema.safeParse(
    Object.fromEntries(Object.entries(source).filter(([, value]) => value !== '')),
  );

export const configErrors = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `config ${issue.path.join('.')}: ${issue.message}`);
