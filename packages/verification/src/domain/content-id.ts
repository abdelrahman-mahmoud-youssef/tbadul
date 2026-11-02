import type { Branded } from './brand.ts';
import { invalidInput, type InvalidInput } from './invalid-input.ts';
import type { Platform } from './platform.ts';
import type { PlatformScoped } from './platform-scoped.ts';
import { rulesFor } from './platforms/rules.ts';
import { err, ok, type Result } from './result.ts';

export type ContentId = Branded<PlatformScoped, 'ContentId'>;

export const parseContentId = (
  platform: Platform,
  input: string,
): Result<ContentId, InvalidInput> => {
  const parsed = rulesFor[platform].contentId.safeParse(input);
  return parsed.success
    ? ok({ platform, value: parsed.data } as ContentId)
    : err(invalidInput('invalid_content_id', input, parsed.error));
};
