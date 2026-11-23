import { createServer, type IncomingMessage } from 'node:http';
import { startTestDatabase } from '@engagement-exchange/db/testing/database';
import { z } from 'zod';
import { createApp } from '../app.ts';
import { createWorld, follow, promoteToAdmin, sourcesOf, worldEnv } from './world.ts';

const settings = z
  .object({
    E2E_API_PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
    E2E_CONTROL_PORT: z.coerce.number().int().min(1).max(65_535).default(4101),
    E2E_WEB_ORIGIN: z.url().default('http://localhost:3100'),
  })
  .parse(process.env);

const host = '127.0.0.1';

const database = await startTestDatabase();
const world = createWorld(Date.now());
const created = await createApp(
  worldEnv({ databaseUrl: database.connectionString, webOrigin: settings.E2E_WEB_ORIGIN }),
  { parts: { sources: sourcesOf(world), clock: world.clock } },
);
if (!created.ok) {
  await database.stop();
  throw new Error(created.error);
}
const { app, api } = created.value;
await app.listen({ port: settings.E2E_API_PORT, host });

const handle = z.string().min(1);

const commands = {
  profile: z.object({
    handle,
    isPrivate: z.boolean().optional(),
    missing: z.boolean().optional(),
    followerCount: z.number().int().nonnegative().optional(),
  }),
  follow: z.object({ performer: handle, target: handle }),
  account: z.object({ handle }),
  failing: z.object({ handle, failing: z.boolean() }),
  advance: z.object({ ms: z.number().int().positive() }),
  admin: z.object({ email: z.email() }),
};

const shutdown = async (): Promise<void> => {
  control.close();
  await app.close();
  await database.stop();
  process.exit(0);
};

const routes: Record<string, (body: unknown) => unknown> = {
  'POST /reset': () => {
    world.profiles.clear();
    world.following.clear();
    world.followsEveryone.clear();
    world.failing.clear();
  },
  'POST /profiles': (body) => {
    const { handle: account, ...profile } = commands.profile.parse(body);
    world.profiles.set(account, profile);
  },
  'POST /follows': (body) => {
    const { performer, target } = commands.follow.parse(body);
    follow(world, performer, target);
  },
  'POST /follows-everyone': (body) => {
    world.followsEveryone.add(commands.account.parse(body).handle);
  },
  'POST /failing': (body) => {
    const { handle: account, failing } = commands.failing.parse(body);
    if (failing) world.failing.add(account);
    else world.failing.delete(account);
  },
  'GET /clock': () => ({ now: new Date(world.clock.now()).toISOString() }),
  'POST /clock/advance': (body) => {
    world.clock.advance(commands.advance.parse(body).ms);
    return { now: new Date(world.clock.now()).toISOString() };
  },
  'POST /pool': async (body) => {
    const added = await api.verificationAccounts.addVerificationAccount({
      platform: 'tiktok',
      account: commands.account.parse(body).handle,
    });
    if (!added.ok) throw new Error(added.error.kind);
    return { handle: added.value.account.handle.value, status: added.value.status };
  },
  'POST /admins': (body) => promoteToAdmin(api, commands.admin.parse(body).email),
  'POST /shutdown': () => {
    setImmediate(() => void shutdown());
  },
};

const bodyOf = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text === '' ? {} : JSON.parse(text);
};

const control = createServer((request, response) => {
  const route = routes[`${request.method ?? ''} ${request.url ?? ''}`];
  const send = (status: number, payload: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload ?? {}));
  };
  if (route === undefined) {
    send(404, { error: 'unknown control route' });
    return;
  }
  bodyOf(request)
    .then(route)
    .then(
      (result) => {
        send(200, result);
      },
      (error: unknown) => {
        send(400, { error: error instanceof Error ? error.message : String(error) });
      },
    );
});

control.listen(settings.E2E_CONTROL_PORT, host);

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

console.info(
  `e2e api on http://${host}:${settings.E2E_API_PORT}, control on http://${host}:${settings.E2E_CONTROL_PORT}`,
);
