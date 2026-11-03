import { parseArgs } from 'node:util';
import type { Attempt } from '@engagement-exchange/verification';
import { composeSocialAccounts, composeVerifier } from './compose.ts';
import { readEnv } from './config.ts';
import { followsCommand, usageError } from './follows.ts';
import { linkStart, linkVerify } from './link.ts';
import { verificationPool } from './pool.ts';

const usage = [
  'usage:',
  '  cli link start <handle-or-url> [--verification-account <handle>]...',
  '  cli link verify <claim-id>',
  '  cli follows <performer> <target>',
].join('\n');

const run = async (argv: readonly string[]): Promise<number> => {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: { 'verification-account': { type: 'string', multiple: true, default: [] } },
  });
  const [group, first, second] = positionals;
  const env = readEnv(process.env);
  if (group === 'follows' && first !== undefined && second !== undefined) {
    const attempts: Attempt[] = [];
    const verifier = composeVerifier(env, { record: (attempt) => attempts.push(attempt) });
    return followsCommand(verifier, attempts, first, second);
  }
  if (group === 'link' && first === 'start' && second !== undefined) {
    const pool = verificationPool(values['verification-account'], env.VERIFICATION_ACCOUNTS);
    if (!pool.ok) {
      console.error(pool.error);
      return usageError;
    }
    const social = composeSocialAccounts(env, composeVerifier(env), pool.value);
    return linkStart(social, env.CLI_USER_ID, second);
  }
  if (group === 'link' && first === 'verify' && second !== undefined) {
    return linkVerify(composeSocialAccounts(env, composeVerifier(env), []), second);
  }
  console.error(usage);
  return usageError;
};

process.exitCode = await run(process.argv.slice(2));
