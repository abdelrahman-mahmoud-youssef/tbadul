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
  scraperSource,
  sidecarSigner,
  type Handle,
  type MeasurementSink,
  type Verifier,
} from '@engagement-exchange/verification';
import type { Env } from './config.ts';

const discard: MeasurementSink = { record: () => undefined };

export const composeVerifier = (env: Env, measurements = discard): Verifier => {
  const http = createHttpClient({ headers: () => ({}) });
  const scraper = scraperSource({ http, signer: sidecarSigner(http, env.TIKTOK_SIGNER_URL) });
  return createVerifier(
    { order: env.VERIFICATION_SOURCE_ORDER, timeoutMs: env.OUTBOUND_TIMEOUT_MS, pageCap: 3 },
    { sources: [scraper], measurements },
  );
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
