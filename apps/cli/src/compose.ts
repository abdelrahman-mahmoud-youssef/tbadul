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
  parseHandle,
  scraperSource,
  sidecarSigner,
  type Handle,
  type Verifier,
} from '@engagement-exchange/verification';
import type { Env } from './config.ts';

const handles = (values: readonly string[]): Handle[] =>
  values.map((value) => {
    const parsed = parseHandle('tiktok', value);
    if (!parsed.ok) throw new Error(`VERIFICATION_ACCOUNTS: ${value} is ${parsed.error.reason}`);
    return parsed.value;
  });

export const composeVerifier = (env: Env): Verifier => {
  const http = createHttpClient({ headers: () => ({}) });
  const scraper = scraperSource({ http, signer: sidecarSigner(http, env.TIKTOK_SIGNER_URL) });
  return createVerifier(
    { order: env.VERIFICATION_SOURCE_ORDER, timeoutMs: env.OUTBOUND_TIMEOUT_MS, pageCap: 3 },
    { sources: [scraper] },
  );
};

export const composeSocialAccounts = (env: Env, verifier: Verifier): SocialAccounts =>
  createSocialAccounts(
    { eligibility: {}, cooldown: {} },
    {
      verifier,
      repository: fileClaimRepository(env.CLAIMS_FILE),
      pool: configVerificationAccountPool(handles(env.VERIFICATION_ACCOUNTS)),
      ids: uuidIds,
    },
  );
