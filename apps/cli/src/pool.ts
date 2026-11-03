import { err, ok, parseHandle, type Handle, type Result } from '@engagement-exchange/verification';

export const missingPool =
  'no verification account: pass --verification-account <handle> (repeatable) or set VERIFICATION_ACCOUNTS';

export const verificationPool = (
  flags: readonly string[],
  fromEnv: readonly string[],
): Result<Handle[], string> => {
  const values = flags.length > 0 ? flags : fromEnv;
  if (values.length === 0) return err(missingPool);
  const pool: Handle[] = [];
  for (const value of values) {
    const parsed = parseHandle('tiktok', value);
    if (!parsed.ok) return err(`invalid verification account ${value}: ${parsed.error.reason}`);
    pool.push(parsed.value);
  }
  return ok(pool);
};
