import { parseArgs } from 'node:util';
import { composeSocialAccounts, composeVerifier } from './compose.ts';
import { readEnv } from './config.ts';
import { linkStart, linkVerify } from './link.ts';
import { verificationPool } from './pool.ts';

const usage = [
  'usage:',
  '  cli link start <handle-or-url> [--verification-account <handle>]...',
  '  cli link verify <claim-id>',
].join('\n');

const usageError = 64;

const run = async (argv: readonly string[]): Promise<number> => {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: { 'verification-account': { type: 'string', multiple: true, default: [] } },
  });
  const [group, command, argument] = positionals;
  if (group !== 'link' || argument === undefined) {
    console.error(usage);
    return usageError;
  }
  const env = readEnv(process.env);
  switch (command) {
    case 'start': {
      const pool = verificationPool(values['verification-account'], env.VERIFICATION_ACCOUNTS);
      if (!pool.ok) {
        console.error(pool.error);
        return usageError;
      }
      const social = composeSocialAccounts(env, composeVerifier(env), pool.value);
      return linkStart(social, env.CLI_USER_ID, argument);
    }
    case 'verify':
      return linkVerify(composeSocialAccounts(env, composeVerifier(env), []), argument);
    default:
      console.error(usage);
      return usageError;
  }
};

process.exitCode = await run(process.argv.slice(2));
