import type { Branded } from './brand.ts';
import { invalidInput, type InvalidInput } from './invalid-input.ts';
import type { Platform } from './platform.ts';
import type { PlatformScoped } from './platform-scoped.ts';
import { rulesFor } from './platforms/rules.ts';
import { err, ok, type Result } from './result.ts';

export type Handle = Branded<PlatformScoped, 'Handle'>;

export const parseHandle = (platform: Platform, input: string): Result<Handle, InvalidInput> => {
  const parsed = rulesFor[platform].handle.safeParse(input);
  return parsed.success
    ? ok({ platform, value: parsed.data } as Handle)
    : err(invalidInput('invalid_handle', input, parsed.error));
};
