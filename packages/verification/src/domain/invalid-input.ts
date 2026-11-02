import type { ZodError } from 'zod';

export type InvalidInputKind = 'invalid_handle' | 'invalid_content_id' | 'invalid_bio_token';

export interface InvalidInput {
  readonly kind: InvalidInputKind;
  readonly input: string;
  readonly reason: string;
}

export const invalidInput = (
  kind: InvalidInputKind,
  input: string,
  error: ZodError,
): InvalidInput => ({
  kind,
  input,
  reason: error.issues.map((issue) => issue.message).join(', '),
});
