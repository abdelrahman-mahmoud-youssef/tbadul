export {
  drizzleCheckLog,
  type CheckLog,
  type CheckSubjects,
} from './adapters/drizzle/drizzle-check-log.ts';
export { drizzleProfileCache } from './adapters/drizzle/drizzle-profile-cache.ts';
export type { EnsembledataDeps } from './adapters/ensembledata/ensembledata-client.ts';
export { ensembledataSource } from './adapters/ensembledata/ensembledata-source.ts';
export { createHttpClient, type HttpClient } from './adapters/http/http-client.ts';
export { fetchTransport, type Transport } from './adapters/http/transport.ts';
export type { LamatokDeps } from './adapters/lamatok/lamatok-client.ts';
export { lamatokSource } from './adapters/lamatok/lamatok-source.ts';
export { scraperSource, type ScraperDeps } from './adapters/scraper/scraper-source.ts';
export { sidecarSigner } from './adapters/scraper/sidecar/sidecar-signer.ts';
export type { ScraptikDeps } from './adapters/scraptik/scraptik-client.ts';
export { scraptikSource } from './adapters/scraptik/scraptik-source.ts';
export type { ProfileCacheTtl } from './application/cached-profile.ts';
export type { Verify, VerifyFollowsBatch, VerifyOptions } from './application/chain.ts';
export type { VerifyOwnership } from './application/ownership.ts';
export {
  createVerifier,
  verifierConfigSchema,
  type Verifier,
  type VerifierConfig,
  type VerifierDeps,
} from './create-verifier.ts';
export { accountId, type AccountId, type ListedAccount } from './domain/account-id.ts';
export { failed, type Answer, type ListUnread, type SourceFailure } from './domain/answer.ts';
export type { Attempt } from './domain/attempt.ts';
export { bioContainsToken, parseBioToken, type BioToken } from './domain/bio-token.ts';
export {
  checkKinds,
  checkPlatform,
  type Check,
  type CheckKind,
  type CheckOf,
} from './domain/check.ts';
export { parseContentId, type ContentId } from './domain/content-id.ts';
export type { EvidenceByKind, ListEvidence, ProfileEvidence } from './domain/evidence.ts';
export type {
  FollowsAnswer,
  FollowsBatch,
  FollowsRead,
  FollowsTarget,
} from './domain/follows-batch.ts';
export { parseHandle, type Handle } from './domain/handle.ts';
export type { InvalidInput, InvalidInputKind } from './domain/invalid-input.ts';
export {
  costUnits,
  outcomes,
  sourceErrorKinds,
  type Cost,
  type CostUnit,
  type Outcome,
  type SourceError,
  type SourceErrorKind,
} from './domain/outcome.ts';
export { platforms, samePlatform, type Platform } from './domain/platform.ts';
export { identityKey, sameIdentity, type PlatformScoped } from './domain/platform-scoped.ts';
export { err, ok, type Result } from './domain/result.ts';
export type { SourceName } from './domain/source-name.ts';
export type { Verdict } from './domain/verdict.ts';
export type { Clock } from './ports/clock.ts';
export type { MeasurementSink } from './ports/measurement-sink.ts';
export type { CachedProfile, ProfileCache, ProfileEntry } from './ports/profile-cache.ts';
export type { RequestSigner, SignedRequest } from './ports/request-signer.ts';
export type {
  CallContext,
  FollowsAsk,
  SourceAnswer,
  SourceCheck,
  SourceCheckOf,
  VerificationSource,
} from './ports/verification-source.ts';
