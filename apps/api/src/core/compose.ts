import { createDatabase, type DatabaseClient } from '@engagement-exchange/db';
import {
  createSocialAccounts,
  createVerificationAccounts,
  drizzleVerificationAccountPool,
  drizzleClaimRepository,
  uuidIds,
  type SocialAccounts,
  type VerificationAccounts,
} from '@engagement-exchange/social-accounts';
import {
  allSinks,
  assembleSources,
  createHttpClient,
  createVerifier,
  defaultSourceOrders,
  drizzleCheckLog,
  drizzleProfileCache,
  drizzleSpendLedger,
  err,
  fallbackCounter,
  ok,
  planSourceOrders,
  type AssembledSources,
  type Clock,
  type DailyBudget,
  type FallbackCounter,
  type KnownSourceName,
  type MeasurementSink,
  type Result,
  type SourceOrders,
} from '@engagement-exchange/verification';
import { createAuth, type Auth } from '../auth/auth.ts';
import type { Env } from './config.ts';

export type Warn = (fields: Record<string, unknown>, message: string) => void;

interface SourcePlan {
  readonly configured: readonly KnownSourceName[];
  readonly leftOut: readonly KnownSourceName[];
  readonly orders: SourceOrders;
}

export interface Api {
  readonly database: DatabaseClient;
  readonly auth: Auth;
  readonly socialAccounts: SocialAccounts;
  readonly verificationAccounts: VerificationAccounts;
  readonly fallbacks: FallbackCounter;
  readonly sources: SourcePlan;
}

export interface ApiParts {
  readonly sources?: AssembledSources;
  readonly clock?: Clock;
}

const pageCap = 3;

const configuredOrders = (env: Env): SourceOrders => ({
  profile:
    env.VERIFICATION_SOURCE_ORDER_PROFILE ??
    env.VERIFICATION_SOURCE_ORDER ??
    defaultSourceOrders.profile,
  follows:
    env.VERIFICATION_SOURCE_ORDER_FOLLOWS ??
    env.VERIFICATION_SOURCE_ORDER ??
    defaultSourceOrders.follows,
  liked:
    env.VERIFICATION_SOURCE_ORDER_LIKED ??
    env.VERIFICATION_SOURCE_ORDER ??
    defaultSourceOrders.liked,
});

const dailyBudgets = (env: Env, sources: AssembledSources): Record<string, DailyBudget> => {
  const configured: [KnownSourceName, DailyBudget | undefined][] = [
    [
      'ensemble',
      env.ENSEMBLEDATA_DAILY_UNITS === undefined
        ? undefined
        : { unit: 'units', daily: env.ENSEMBLEDATA_DAILY_UNITS },
    ],
    [
      'scraptik',
      env.SCRAPTIK_DAILY_REQUESTS === undefined
        ? undefined
        : { unit: 'request', daily: env.SCRAPTIK_DAILY_REQUESTS },
    ],
    [
      'tokapi',
      env.TOKAPI_DAILY_REQUESTS === undefined
        ? undefined
        : { unit: 'request', daily: env.TOKAPI_DAILY_REQUESTS },
    ],
    [
      'lamatok',
      env.LAMATOK_DAILY_REQUESTS === undefined
        ? undefined
        : { unit: 'request', daily: env.LAMATOK_DAILY_REQUESTS },
    ],
  ];
  return Object.fromEntries(
    configured.filter(
      (entry): entry is [KnownSourceName, DailyBudget] =>
        entry[1] !== undefined && sources.has(entry[0]),
    ),
  );
};

const assembled = (env: Env): AssembledSources =>
  assembleSources(
    {
      signerUrl: env.TIKTOK_SIGNER_URL,
      lamatokKey: env.LAMATOK_ACCESS_KEY,
      ensembleTokens: [
        ...env.ENSEMBLEDATA_TOKENS,
        ...(env.ENSEMBLEDATA_TOKEN === undefined ? [] : [env.ENSEMBLEDATA_TOKEN]),
      ],
      rapidApiKey: env.RAPIDAPI_KEY ?? env.SCRAPTIK_RAPIDAPI_KEY,
    },
    createHttpClient({ headers: () => ({}) }),
  );

const checkLogSink = (database: DatabaseClient, env: Env, warn: Warn): MeasurementSink => {
  const checkLog = drizzleCheckLog(database.db, env.MEASUREMENT_HMAC_KEY);
  return {
    record: (attempt) => {
      checkLog.append(attempt, {}).catch((error: unknown) => {
        warn({ err: error, source: attempt.source }, 'check log: attempt not stored');
      });
    },
  };
};

export const composeApi = (env: Env, warn: Warn, parts: ApiParts = {}): Result<Api, string> => {
  const sources = parts.sources ?? assembled(env);
  const planned = planSourceOrders(configuredOrders(env), new Set(sources.keys()));
  if (!planned.ok) return err(`no configured source left for ${planned.error.check} checks`);
  const { orders, leftOut } = planned.value;
  const database = createDatabase(env.DATABASE_URL);
  const fallbacks = fallbackCounter();
  const clock = parts.clock;
  const verifier = createVerifier(
    {
      order: {
        profile: [...orders.profile],
        follows: [...orders.follows],
        liked: [...orders.liked],
      },
      timeoutMs: env.OUTBOUND_TIMEOUT_MS,
      pageCap,
      confirmNotFollowing: env.VERIFICATION_CONFIRM_NOT_FOLLOWING,
      confirmNotFound: env.VERIFICATION_CONFIRM_NOT_FOUND,
      budgets: dailyBudgets(env, sources),
      concurrency: Object.fromEntries(
        [...sources.keys()].map((name) => [
          name,
          { limit: env.VERIFICATION_CONCURRENCY, queue: env.VERIFICATION_QUEUE },
        ]),
      ),
    },
    {
      sources: [...sources.values()],
      measurements: allSinks(checkLogSink(database, env, warn), fallbacks),
      profileCache: drizzleProfileCache(database.db),
      spendLedger: drizzleSpendLedger(database.db),
      onBudgetReached: (source, day) => {
        warn({ source, day }, 'source reached its daily budget: skipped until the next UTC day');
      },
      ...(clock !== undefined && { clock }),
    },
  );
  const pool = drizzleVerificationAccountPool(database.db);
  return ok({
    database,
    auth: createAuth(database.db, {
      secret: env.BETTER_AUTH_SECRET,
      publicOrigin: env.PUBLIC_WEB_ORIGIN,
    }),
    socialAccounts: createSocialAccounts(
      { eligibility: {}, cooldown: {} },
      {
        verifier,
        repository: drizzleClaimRepository(database.db),
        pool,
        ids: uuidIds,
        ...(clock !== undefined && { clock }),
      },
    ),
    verificationAccounts: createVerificationAccounts({
      verifier,
      accounts: pool,
      ...(clock !== undefined && { clock }),
    }),
    fallbacks,
    sources: { configured: [...sources.keys()], leftOut, orders },
  });
};
