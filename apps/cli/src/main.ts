import { parseArgs } from 'node:util';
import { composeSocialAccounts, composeVerifier } from './compose.ts';
import { readEnv } from './config.ts';
import { linkStart, linkVerify } from './link.ts';

const usage = 'usage: cli link start <handle-or-url> | cli link verify <claim-id>';

const run = async (argv: readonly string[]): Promise<number> => {
  const { positionals } = parseArgs({ args: [...argv], allowPositionals: true, strict: true });
  const [group, command, argument] = positionals;
  if (group !== 'link' || argument === undefined) {
    console.error(usage);
    return 2;
  }
  const env = readEnv(process.env);
  const social = composeSocialAccounts(env, composeVerifier(env));
  switch (command) {
    case 'start':
      return linkStart(social, env.CLI_USER_ID, argument);
    case 'verify':
      return linkVerify(social, argument);
    default:
      console.error(usage);
      return 2;
  }
};

process.exitCode = await run(process.argv.slice(2));
