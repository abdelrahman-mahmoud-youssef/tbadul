import { parseArgs } from 'node:util';
import type { Attempt } from '@engagement-exchange/verification';
import { composeSocialAccounts, composeVerifier } from './compose.ts';
import { readEnv } from './config.ts';
import { followsCommand, likedCommand, usageError } from './follows.ts';
import { linkStart, linkVerify } from './link.ts';
import { verificationPool } from './pool.ts';

const usage = [
  'usage:',
  '  cli link start <handle-or-url> [--verification-account <handle>]...',
  '  cli link verify <claim-id>',
  '  cli follows <performer> <target>',
  '  cli liked <performer> <video-id-or-url>',
].join('\n');

const run = async (argv: readonly string[]): Promise<number> => {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: { 'verification-account': { type: 'string', multiple: true, default: [] } },
  });
  const [group, first, second] = positionals;
  const loaded = readEnv(process.env);
  if (!loaded.ok) {
    for (const line of loaded.error) console.error(line);
    return usageError;
  }
  const env = loaded.value;
  const attempts: Attempt[] = [];
  const composed = composeVerifier(env, { record: (attempt) => attempts.push(attempt) });
  if (!composed.ok) {
    console.error(composed.error);
    return usageError;
  }
  const { verifier, leftOut } = composed.value;
  if (leftOut.length > 0) console.error(`sources left out, no credential: ${leftOut.join(', ')}`);
  if (group === 'liked' && first !== undefined && second !== undefined) {
    return likedCommand(verifier, attempts, first, second);
  }
  if (group === 'follows' && first !== undefined && second !== undefined) {
    return followsCommand(verifier, attempts, first, second);
  }
  if (group === 'link' && first === 'start' && second !== undefined) {
    const pool = verificationPool(values['verification-account'], env.VERIFICATION_ACCOUNTS);
    if (!pool.ok) {
      console.error(pool.error);
      return usageError;
    }
    const social = composeSocialAccounts(env, verifier, pool.value);
    return linkStart(social, env.CLI_USER_ID, second);
  }
  if (group === 'link' && first === 'verify' && second !== undefined) {
    return linkVerify(composeSocialAccounts(env, verifier, []), second);
  }
  console.error(usage);
  return usageError;
};

process.exitCode = await run(process.argv.slice(2));
