export { defineSource, type CheckHandler, type CheckHandlers } from './adapters/define-source.ts';
export { withTimeout } from './adapters/resilience/with-timeout.ts';
export type { Verify, VerifyOptions } from './application/chain.ts';
export type { VerifyOwnership } from './application/ownership.ts';
export {
  createVerifier,
  verifierConfigSchema,
  type Verifier,
  type VerifierConfig,
  type VerifierDeps,
} from './create-verifier.ts';
export { accountId, type AccountId } from './domain/account-id.ts';
export { failed, type Answer, type SourceFailure } from './domain/answer.ts';
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
export { parseHandle, type Handle } from './domain/handle.ts';
export type { InvalidInput, InvalidInputKind } from './domain/invalid-input.ts';
export {
  outcomes,
  sourceErrorKinds,
  type Cost,
  type CostUnit,
  type Outcome,
  type SourceError,
  type SourceErrorKind,
} from './domain/outcome.ts';
export { platforms, type Platform } from './domain/platform.ts';
export { identityKey, sameIdentity, type PlatformScoped } from './domain/platform-scoped.ts';
export { err, ok, type Result } from './domain/result.ts';
export type { SourceName } from './domain/source-name.ts';
export type { Verdict } from './domain/verdict.ts';
export type { Clock } from './ports/clock.ts';
export type { MeasurementSink } from './ports/measurement-sink.ts';
export type { CallContext, VerificationSource } from './ports/verification-source.ts';
