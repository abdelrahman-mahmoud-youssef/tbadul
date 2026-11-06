import {
  createSocialAccounts,
  uuidIds,
  type AccountClaimRepository,
  type SocialAccounts,
  type VerificationAccountPool,
} from '@engagement-exchange/social-accounts';
import {
  createHttpClient,
  createVerifier,
  ensembledataSource,
  lamatokSource,
  scraperSource,
  scraptikSource,
  sidecarSigner,
  err,
  ok,
  type MeasurementSink,
  type ProfileCache,
  type Result,
  type VerificationSource,
  type Verifier,
} from '@engagement-exchange/verification';
import type { CliSourceName, Env, SourceChoice } from './config.ts';
import { ordersFor, planOrders } from './orders.ts';

const discard: MeasurementSink = { record: () => undefined };

export const listChecks = ['follows', 'liked'] as const;

export type ListCheck = (typeof listChecks)[number];

export interface ComposedVerifier {
  readonly verifier: Verifier;
  readonly leftOut: readonly CliSourceName[];
  readonly unconfirmed: readonly ListCheck[];
}

export type Sources = ReadonlyMap<CliSourceName, VerificationSource>;

export interface VerifierParts {
  readonly sources?: Sources;
  readonly profileCache?: ProfileCache;
}

const availableSources = (env: Env): Sources => {
  const http = createHttpClient({ headers: () => ({}) });
  const sources = new Map<CliSourceName, VerificationSource>([
    ['scraper', scraperSource({ http, signer: sidecarSigner(http, env.TIKTOK_SIGNER_URL) })],
  ]);
  if (env.LAMATOK_ACCESS_KEY !== undefined) {
    sources.set('lamatok', lamatokSource({ http, accessKey: env.LAMATOK_ACCESS_KEY }));
  }
  if (env.ENSEMBLEDATA_TOKEN !== undefined) {
    sources.set('ensemble', ensembledataSource({ http, token: env.ENSEMBLEDATA_TOKEN }));
  }
  if (env.SCRAPTIK_RAPIDAPI_KEY !== undefined) {
    sources.set('scraptik', scraptikSource({ http, rapidApiKey: env.SCRAPTIK_RAPIDAPI_KEY }));
  }
  return sources;
};

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
  const planned = planOrders(ordersFor(env, choice), new Set(sources.keys()));
  if (!planned.ok) return planned;
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
    },
    {
      sources: [...sources.values()],
      measurements,
      ...(parts.profileCache !== undefined && { profileCache: parts.profileCache }),
    },
  );
  const serving = (kind: ListCheck) =>
    planned.value.orders[kind].filter((name) => sources.get(name)?.supports.has(kind) === true);
  return ok({
    verifier,
    leftOut: planned.value.leftOut,
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
