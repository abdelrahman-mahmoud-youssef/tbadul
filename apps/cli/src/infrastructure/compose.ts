import {
  createSocialAccounts,
  createVerificationAccounts,
  uuidIds,
  type AccountClaimRepository,
  type SocialAccounts,
  type VerificationAccountAdmin,
  type VerificationAccountPool,
  type VerificationAccounts,
} from '@engagement-exchange/social-accounts';
import {
  assembleSources,
  createHttpClient,
  createVerifier,
  err,
  ok,
  planSourceOrders,
  type AssembledSources,
  type KnownSourceName,
  type MeasurementSink,
  type DailyBudget,
  type ProfileCache,
  type Result,
  type SpendLedger,
  type Verifier,
} from '@engagement-exchange/verification';
import type { Env, SourceChoice } from './config.ts';
import { ordersFor } from './orders.ts';

const discard: MeasurementSink = { record: () => undefined };

export const listChecks = ['follows', 'liked'] as const;

export type ListCheck = (typeof listChecks)[number];

export interface ComposedVerifier {
  readonly verifier: Verifier;
  readonly leftOut: readonly KnownSourceName[];
  readonly unconfirmed: readonly ListCheck[];
  readonly unused: readonly KnownSourceName[];
}

export type Sources = AssembledSources;

export interface VerifierParts {
  readonly sources?: Sources;
  readonly profileCache?: ProfileCache;
  readonly spendLedger?: SpendLedger;
}

export const budgetReached = (source: string, day: string): string =>
  `source ${source} reached its daily budget for ${day}: skipped until the next UTC day`;

const dailyBudgets = (env: Env, sources: Sources): Record<string, DailyBudget> => {
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

const availableSources = (env: Env): Sources =>
  assembleSources(
    {
      signerUrl: env.TIKTOK_SIGNER_URL,
      lamatokKey: env.LAMATOK_ACCESS_KEY,
      ensembleTokens: [
        ...env.ENSEMBLEDATA_TOKENS,
        ...(env.ENSEMBLEDATA_TOKEN === undefined ? [] : [env.ENSEMBLEDATA_TOKEN]),
      ],
      scraptikKey: env.SCRAPTIK_RAPIDAPI_KEY,
    },
    createHttpClient({ headers: () => ({}) }),
  );

export const composeVerifier = (
  env: Env,
  measurements = discard,
  choice: SourceChoice = 'chain',
  parts: VerifierParts = {},
): Result<ComposedVerifier, string> => {
  const sources = parts.sources ?? availableSources(env);
  if (choice !== 'chain' && !sources.has(choice)) {
    return err(`source ${choice} has no credential configured`);
  }
  const planned = planSourceOrders(ordersFor(env, choice), new Set(sources.keys()));
  if (!planned.ok) return err(`no configured source left for ${planned.error.check} checks`);
  const verifier = createVerifier(
    {
      order: {
        profile: [...planned.value.orders.profile],
        follows: [...planned.value.orders.follows],
        liked: [...planned.value.orders.liked],
      },
      timeoutMs: env.OUTBOUND_TIMEOUT_MS,
      pageCap: 3,
      confirmNotFollowing: env.VERIFICATION_CONFIRM_NOT_FOLLOWING,
      budgets: dailyBudgets(env, sources),
    },
    {
      sources: [...sources.values()],
      measurements,
      onBudgetReached: (source, day) => {
        console.error(budgetReached(source, day));
      },
      ...(parts.spendLedger !== undefined && { spendLedger: parts.spendLedger }),
      ...(parts.profileCache !== undefined && { profileCache: parts.profileCache }),
    },
  );
  const serving = (kind: ListCheck) =>
    planned.value.orders[kind].filter((name) => sources.get(name)?.supports.has(kind) === true);
  return ok({
    verifier,
    leftOut: planned.value.leftOut,
    unused: [...sources.keys()].filter(
      (name) => !Object.values(planned.value.orders).some((names) => names.includes(name)),
    ),
    unconfirmed: env.VERIFICATION_CONFIRM_NOT_FOLLOWING
      ? listChecks.filter((kind) => serving(kind).length < 2)
      : [],
  });
};

export const composeSocialAccounts = (
  verifier: Verifier,
  repository: AccountClaimRepository,
  pool: VerificationAccountPool,
): SocialAccounts =>
  createSocialAccounts(
    { eligibility: {}, cooldown: {} },
    { verifier, repository, pool, ids: uuidIds },
  );

export const composeVerificationAccounts = (
  verifier: Verifier,
  accounts: VerificationAccountAdmin,
): VerificationAccounts => createVerificationAccounts({ verifier, accounts });
