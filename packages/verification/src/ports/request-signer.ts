import type { SourceError } from '../domain/outcome.ts';
import type { Result } from '../domain/result.ts';

export interface SignedRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface RequestSigner {
  sign(url: string, signal: AbortSignal): Promise<Result<SignedRequest, SourceError>>;
}
