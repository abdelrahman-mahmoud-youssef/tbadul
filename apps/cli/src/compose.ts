import {
  configVerificationAccountPool,
  createSocialAccounts,
  fileClaimRepository,
  uuidIds,
  type SocialAccounts,
} from '@engagement-exchange/social-accounts';
import {
  createHttpClient,
  createVerifier,
  lamatokSource,
  scraperSource,
  sidecarSigner,
  ok,
  type Handle,
  type MeasurementSink,
  type Result,
  type VerificationSource,
  type Verifier,
} from '@engagement-exchange/verification';
import type { CliSourceName, Env } from './config.ts';
import { configuredOrders, planOrders } from './orders.ts';

const discard: MeasurementSink = { record: () => undefined };

export interface ComposedVerifier {
  readonly verifier: Verifier;
  readonly leftOut: readonly CliSourceName[];
}

const availableSources = (env: Env): Map<CliSourceName, VerificationSource> => {
  const http = createHttpClient({ headers: () => ({}) });
  const sources = new Map<CliSourceName, VerificationSource>([
    ['scraper', scraperSource({ http, signer: sidecarSigner(http, env.TIKTOK_SIGNER_URL) })],
  ]);
  if (env.LAMATOK_ACCESS_KEY !== undefined) {
    sources.set('lamatok', lamatokSource({ http, accessKey: env.LAMATOK_ACCESS_KEY }));
  }
  return sources;
};

export const composeVerifier = (
  env: Env,
  measurements = discard,
): Result<ComposedVerifier, string> => {
  const sources = availableSources(env);
  const planned = planOrders(configuredOrders(env), new Set(sources.keys()));
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
    { sources: [...sources.values()], measurements },
  );
  return ok({ verifier, leftOut: planned.value.leftOut });
};

export const composeSocialAccounts = (
  env: Env,
  verifier: Verifier,
  pool: readonly Handle[],
): SocialAccounts =>
  createSocialAccounts(
    { eligibility: {}, cooldown: {} },
    {
      verifier,
      repository: fileClaimRepository(env.CLAIMS_FILE),
      pool: configVerificationAccountPool(pool),
      ids: uuidIds,
    },
  );
