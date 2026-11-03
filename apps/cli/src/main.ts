import { parseArgs } from 'node:util';
import type { Attempt, Verifier } from '@engagement-exchange/verification';
import { composeSocialAccounts, composeVerifier } from './compose.ts';
import { readEnv, sourceChoice, sourceChoices } from './config.ts';
import { parseDemo, type Demo } from './demo.ts';
import {
  followsCommand,
  likedCommand,
  ownsCommand,
  profileCommand,
  usageError,
} from './follows.ts';
import { linkStart, linkVerify } from './link.ts';
import { verificationPool } from './pool.ts';

const usage = [
  'usage:',
  '  cli profile <handle> [--source <name>]',
  '  cli owns <handle> <bio-token> [--source <name>]',
  '  cli follows <performer> <target> [--source <name>]',
  '  cli liked <performer> <video-id-or-url> [--source <name>]',
  '  cli link start <handle-or-url> [--verification-account <handle>]...',
  '  cli link verify <claim-id>',
  '',
  '  --source scraper|lamatok|ensemble|chain   one source for every check, or the configured',
  '                                            per-kind orders (chain, the default)',
].join('\n');

const parse = (argv: readonly string[]) => {
  try {
    return parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        'verification-account': { type: 'string', multiple: true, default: [] },
        source: { type: 'string' },
      },
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const runDemo = (verifier: Verifier, attempts: readonly Attempt[], demo: Demo) => {
  switch (demo.command) {
    case 'profile':
      return profileCommand(verifier, attempts, demo.subject);
    case 'owns':
      return ownsCommand(verifier, attempts, demo.subject, demo.token);
    case 'follows':
      return followsCommand(verifier, attempts, demo.performer, demo.target);
    case 'liked':
      return likedCommand(verifier, attempts, demo.performer, demo.content);
  }
};

const run = async (argv: readonly string[]): Promise<number> => {
  const parsed = parse(argv);
  if (typeof parsed === 'string') {
    console.error(parsed);
    console.error(usage);
    return usageError;
  }
  const { positionals, values } = parsed;
  const [group, first, second] = positionals;
  const choice = sourceChoice.safeParse(values.source);
  if (!choice.success) {
    console.error(`invalid --source: use one of ${sourceChoices.join(', ')}`);
    return usageError;
  }
  const demo = parseDemo(positionals);
  if (demo !== undefined && !demo.ok) {
    console.error(demo.error);
    return usageError;
  }
  const loaded = readEnv(process.env);
  if (!loaded.ok) {
    for (const line of loaded.error) console.error(line);
    return usageError;
  }
  const env = loaded.value;
  const attempts: Attempt[] = [];
  const composed = composeVerifier(
    env,
    { record: (attempt) => attempts.push(attempt) },
    choice.data,
  );
  if (!composed.ok) {
    console.error(composed.error);
    return usageError;
  }
  const { verifier, leftOut } = composed.value;
  if (leftOut.length > 0) console.error(`sources left out, no credential: ${leftOut.join(', ')}`);
  if (demo !== undefined) return runDemo(verifier, attempts, demo.value);
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
