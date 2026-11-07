import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { createDatabase, migrationsApplied, type Database } from '@engagement-exchange/db';
import {
  configVerificationAccountPool,
  drizzleClaimRepository,
  drizzleVerificationAccountPool,
  inMemoryClaimRepository,
  type SocialAccounts,
} from '@engagement-exchange/social-accounts';
import {
  drizzleProfileCache,
  drizzleSpendLedger,
  type Attempt,
  type KnownSourceName,
  type ProfileCache,
  type Verifier,
} from '@engagement-exchange/verification';
import { needsDatabase, parseCommand, type Command, type DatabaseCommand } from './command.ts';
import {
  composeSocialAccounts,
  composeVerificationAccounts,
  composeVerifier,
  type ListCheck,
  type Sources,
} from './compose.ts';
import {
  databaseUserId,
  readEnv,
  sourceChoice,
  sourceChoices,
  type Env,
  type SourceChoice,
} from './config.ts';
import type { Demo } from './demo.ts';
import {
  attemptLines,
  cacheUse,
  followsCommand,
  likedCommand,
  ownsCommand,
  profileCommand,
  usageError,
} from './follows.ts';
import { linkStart, linkVerify } from './link.ts';
import { measurementLog, spendLog, type MeasurementLog } from './measurement-log.ts';
import { emptyPool, poolAdd, poolList, resolvePool, verificationPool } from './pool.ts';
import { invalidUser, unknownUser, userAdd, userExists, userRole } from './users.ts';
import { watchFollows } from './watch.ts';

export const usage = [
  'usage:',
  '  cli profile <handle> [--source <name>]',
  '  cli owns <handle> <bio-token> [--source <name>]',
  '  cli follows <performer> <target> [--source <name>]',
  '  cli liked <performer> <video-id-or-url> [--source <name>]',
  '  cli watch follows <performer> <target> [--every <seconds>] [--times <n>] [--source <name>]',
  '  cli link start <handle-or-url> [--verification-account <handle>]...',
  '  cli link verify <claim-id>',
  '  cli user add <email> [--name <name>]',
  '  cli user role <email> <user|admin>',
  '  cli pool add <handle> [--source <name>]',
  '  cli pool list',
  '',
  '  --source <name>                           scraper, lamatok, ensemble or scraptik for one',
  '                                            source, or chain for the per-kind orders (default)',
  '  --every <seconds>                         wait between watch runs (WATCH_INTERVAL_SECONDS, 60)',
  '  --times <n>                               stop after n runs; unbounded when absent',
  '  --verification-account <handle>           the pool for one link start without DATABASE_URL',
  '',
  'With DATABASE_URL set, claims, the verification pool and the profile cache live in PostgreSQL:',
  'user add prints the id for CLI_USER_ID and pool add fills the pool. user and pool need it.',
  '',
  'exit codes: 0 verified, 1 not_following or unfollowed, 2 private, 3 not_found, 4 source_error,',
  '            64 usage or configuration',
].join('\n');

export const inMemory =
  'DATABASE_URL is unset: claims stay in memory and profiles are not cached, so nothing persists';

export const missingSchema =
  'the database schema is missing or behind: run pnpm --filter @engagement-exchange/db migrate';

const confirmerKeys: Readonly<Record<ListCheck, string>> = {
  follows: 'ENSEMBLEDATA_TOKEN or SCRAPTIK_RAPIDAPI_KEY',
  liked: 'ENSEMBLEDATA_TOKEN',
};

export const noConfirmer = (kind: ListCheck): string =>
  `no confirmer for ${kind} checks: a not_following cannot be confirmed by a second source; set ${confirmerKeys[kind]}`;

export const unusedSources = (names: readonly KnownSourceName[]): string =>
  `configured but in no order: ${names.join(', ')}; lamatok stays out of the defaults until it is funded, name a source in VERIFICATION_SOURCE_ORDER_<KIND> to use it`;

export const poolFlagWithDatabase =
  '--verification-account applies without DATABASE_URL; add accounts with pool add <handle>';

export interface CliDeps {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly sources?: (env: Env) => Sources;
  readonly profileCache?: (db: Database) => ProfileCache;
}

interface Run {
  readonly env: Env;
  readonly verifier: Verifier;
  readonly attempts: readonly Attempt[];
  readonly poolFlags: readonly string[];
}

const parse = (argv: readonly string[]) => {
  try {
    return parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        'verification-account': { type: 'string', multiple: true, default: [] },
        source: { type: 'string' },
        every: { type: 'string' },
        times: { type: 'string' },
        name: { type: 'string' },
      },
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const runDemo = ({ env, verifier, attempts }: Run, demo: Demo) => {
  switch (demo.command) {
    case 'profile':
      return profileCommand(verifier, attempts, demo.subject);
    case 'owns':
      return ownsCommand(verifier, attempts, demo.subject, demo.token);
    case 'follows':
      return followsCommand(verifier, attempts, demo.performer, demo.target);
    case 'liked':
      return likedCommand(verifier, attempts, demo.performer, demo.content);
    case 'watch':
      return watchFollows(
        verifier,
        attempts,
        demo.performer,
        demo.target,
        { everySeconds: demo.every ?? env.WATCH_INTERVAL_SECONDS, times: demo.times },
        { sleep, clock: { now: () => Date.now() } },
      );
  }
};

const inMemoryCommand = async (
  run: Run,
  command: Exclude<Command, DatabaseCommand>,
): Promise<number> => {
  switch (command.kind) {
    case 'demo':
      return runDemo(run, command.demo);
    case 'link start': {
      const pool = verificationPool(run.poolFlags, run.env.VERIFICATION_ACCOUNTS);
      if (!pool.ok) {
        console.error(pool.error);
        return usageError;
      }
      const candidates = await resolvePool(run.verifier, pool.value);
      if (typeof candidates === 'number') return candidates;
      const social = composeSocialAccounts(
        run.verifier,
        inMemoryClaimRepository(),
        configVerificationAccountPool(candidates),
      );
      return linkStart(social, run.env.CLI_USER_ID, command.account);
    }
    case 'link verify':
      return linkVerify(
        composeSocialAccounts(
          run.verifier,
          inMemoryClaimRepository(),
          configVerificationAccountPool([]),
        ),
        run.env.CLI_USER_ID,
        command.claim,
      );
  }
};

const databaseUser = async (run: Run, db: Database): Promise<string | undefined> => {
  const user = databaseUserId.safeParse(run.env.CLI_USER_ID);
  if (!user.success) {
    console.error(invalidUser);
    return undefined;
  }
  if (!(await userExists(db, user.data))) {
    console.error(unknownUser);
    return undefined;
  }
  return user.data;
};

const databaseCommand = async (run: Run, db: Database, command: Command): Promise<number> => {
  const pool = drizzleVerificationAccountPool(db);
  const social = (): SocialAccounts =>
    composeSocialAccounts(run.verifier, drizzleClaimRepository(db), pool);
  switch (command.kind) {
    case 'demo':
      return runDemo(run, command.demo);
    case 'user add':
      return userAdd(db, command.email, command.name);
    case 'user role':
      return userRole(db, command.email, command.role);
    case 'pool add':
      return poolAdd(composeVerificationAccounts(run.verifier, pool), command.account);
    case 'pool list':
      return poolList(composeVerificationAccounts(run.verifier, pool));
    case 'link verify': {
      const user = await databaseUser(run, db);
      if (user === undefined) return usageError;
      return linkVerify(social(), user, command.claim);
    }
    case 'link start': {
      if (run.poolFlags.length > 0) {
        console.error(poolFlagWithDatabase);
        return usageError;
      }
      const user = await databaseUser(run, db);
      if (user === undefined) return usageError;
      if ((await pool.candidates('tiktok')).length === 0) {
        console.error(emptyPool);
        return usageError;
      }
      return linkStart(social(), user, command.account);
    }
  }
};

const listCheckOf = (command: Command, choice: SourceChoice): ListCheck | undefined => {
  if (command.kind !== 'demo' || choice !== 'chain') return undefined;
  switch (command.demo.command) {
    case 'follows':
    case 'watch':
      return 'follows';
    case 'liked':
      return 'liked';
    default:
      return undefined;
  }
};

const runCommand = async (
  deps: CliDeps,
  env: Env,
  command: Command,
  flags: { readonly source: string | undefined; readonly poolFlags: readonly string[] },
  db: Database | undefined,
  dispatch: (run: Run) => Promise<number>,
): Promise<number> => {
  const choice = sourceChoice.safeParse(flags.source);
  if (!choice.success) {
    console.error(`invalid --source: use one of ${sourceChoices.join(', ')}`);
    return usageError;
  }
  let log: MeasurementLog | undefined;
  if (command.kind === 'demo') {
    const opened = measurementLog(env, command.demo, db);
    if (!opened.ok) {
      console.error(opened.error);
      return usageError;
    }
    log = opened.value;
  } else if (db !== undefined) {
    log = spendLog(db);
  }
  const attempts: Attempt[] = [];
  const composed = composeVerifier(
    env,
    {
      record: (attempt) => {
        attempts.push(attempt);
        log?.record(attempt);
      },
    },
    choice.data,
    {
      ...(deps.sources !== undefined && { sources: deps.sources(env) }),
      ...(db !== undefined && {
        profileCache: (deps.profileCache ?? drizzleProfileCache)(db),
        spendLedger: drizzleSpendLedger(db),
      }),
    },
  );
  if (!composed.ok) {
    console.error(composed.error);
    return usageError;
  }
  const { verifier, leftOut, unconfirmed, unused } = composed.value;
  if (leftOut.length > 0) console.error(`sources left out, no credential: ${leftOut.join(', ')}`);
  if (unused.length > 0) console.error(unusedSources(unused));
  const links = command.kind === 'link start' || command.kind === 'link verify';
  const listCheck = links ? 'follows' : listCheckOf(command, choice.data);
  if (listCheck !== undefined && unconfirmed.includes(listCheck)) {
    console.error(noConfirmer(listCheck));
    if (links) return usageError;
  }
  const run: Run = { env, verifier, attempts, poolFlags: flags.poolFlags };
  try {
    const code = await dispatch(run);
    if (command.kind !== 'demo') for (const line of attemptLines(attempts)) console.log(line);
    const cache = cacheUse(attempts);
    if (cache !== undefined) console.log(cache);
    return code;
  } finally {
    const failed = (await log?.flush()) ?? 0;
    if (failed > 0) console.error(`check log: ${String(failed)} attempts not stored`);
  }
};

export const run = async (argv: readonly string[], deps: CliDeps): Promise<number> => {
  const parsed = parse(argv);
  if (typeof parsed === 'string') {
    console.error(parsed);
    console.error(usage);
    return usageError;
  }
  const { positionals, values } = parsed;
  const command = parseCommand(positionals, values);
  if (command === undefined) {
    console.error(usage);
    return usageError;
  }
  if (!command.ok) {
    console.error(command.error);
    return usageError;
  }
  const loaded = readEnv(deps.env);
  if (!loaded.ok) {
    for (const line of loaded.error) console.error(line);
    return usageError;
  }
  const env = loaded.value;
  const flags = { source: values.source, poolFlags: values['verification-account'] };
  if (env.DATABASE_URL === undefined) {
    if (needsDatabase(command.value)) {
      console.error(`${command.value.kind} needs DATABASE_URL`);
      return usageError;
    }
    const memoryCommand = command.value;
    console.error(inMemory);
    return runCommand(deps, env, memoryCommand, flags, undefined, (run) =>
      inMemoryCommand(run, memoryCommand),
    );
  }
  const client = createDatabase(env.DATABASE_URL);
  try {
    if (!(await migrationsApplied(client.db))) {
      console.error(missingSchema);
      return usageError;
    }
    return await runCommand(deps, env, command.value, flags, client.db, (run) =>
      databaseCommand(run, client.db, command.value),
    );
  } finally {
    await client.close();
  }
};
