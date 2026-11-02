import { z } from 'zod';
import type { Branded } from './brand.ts';
import { invalidInput, type InvalidInput } from './invalid-input.ts';
import { err, ok, type Result } from './result.ts';

export type BioToken = Branded<string, 'BioToken'>;

const schema = z
  .string()
  .trim()
  .min(1, { error: 'empty', abort: true })
  .max(64, 'too_long')
  .regex(/^\S+$/, 'whitespace');

export const parseBioToken = (input: string): Result<BioToken, InvalidInput> => {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? ok(parsed.data as BioToken)
    : err(invalidInput('invalid_bio_token', input, parsed.error));
};

export const bioContainsToken = (bio: string, token: BioToken): boolean =>
  bio.split(/\s+/).includes(token);
