import { randomUUID } from 'node:crypto';
import { auth_users } from '@engagement-exchange/db';
import { providedDatabaseUrl } from '@engagement-exchange/db/testing';
import {
  accountId,
  type AccountId,
  type AssembledSources,
  type KnownSourceName,
} from '@engagement-exchange/verification';
import {
  fakeSource,
  followingPages,
  manualClock,
  type FollowsHandler,
  type ManualClock,
} from '@engagement-exchange/verification/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { createApp, type LogDestination } from '../app.ts';
import type { Api } from '../compose.ts';
import { envSchema } from '../config.ts';

export const databaseUrl = providedDatabaseUrl();

export const webOrigin = 'http://localhost:3000';

const dayMs = 86_400_000;

interface Profile {
  readonly isPrivate?: boolean;
  readonly missing?: boolean;
  readonly followerCount?: number;
}

export interface World {
  readonly clock: ManualClock;
  readonly profiles: Map<string, Profile>;
  readonly following: Map<string, Set<string>>;
  readonly followsEveryone: Set<string>;
  readonly failing: Set<string>;
  readonly entered: { count: number };
  gate?: Promise<void>;
}

export const uniqueHandle = (prefix: string): string => `${prefix}_${randomUUID().slice(0, 8)}`;

export const idOf = (handle: string): AccountId => accountId('tiktok', `id-${handle}`);

const createWorld = (): World => ({
  clock: manualClock(Date.UTC(2026, 10, 7)),
  profiles: new Map(),
  following: new Map(),
  followsEveryone: new Set(),
  failing: new Set(),
  entered: { count: 0 },
});

export const follow = (world: World, performer: string, target: string): void => {
  const followed = world.following.get(performer) ?? new Set<string>();
  followed.add(target);
  world.following.set(performer, followed);
};

const followsIn =
  (world: World): FollowsHandler =>
  async (check, context) => {
    world.entered.count += 1;
    await world.gate;
    const performer = check.performer.value;
    if (world.failing.has(performer)) {
      return { outcome: 'source_error', error: { kind: 'network', message: 'unreachable' } };
    }
    const listed = world.followsEveryone.has(performer)
      ? check.targets.map(({ targetId }) => targetId.value)
      : [...(world.following.get(performer) ?? [])].map((handle) => idOf(handle).value);
    return followingPages(listed.map((value) => ({ value })))(check, context);
  };

const sourcesOf = (world: World): AssembledSources => {
  const follows = followsIn(world);
  return new Map<KnownSourceName, ReturnType<typeof fakeSource>>([
    [
      'ensemble',
      fakeSource('ensemble', {
        profile: (check) => {
          const handle = check.subject.value;
          const profile = world.profiles.get(handle) ?? {};
          if (profile.missing === true) {
            return Promise.resolve({ outcome: 'not_found', cost: { unit: 'units', amount: 1 } });
          }
          return Promise.resolve({
            outcome: 'verified',
            evidence: {
              accountId: idOf(handle),
              bio: '',
              isPrivate: profile.isPrivate ?? false,
              followingVisible: true,
              followerCount: profile.followerCount ?? 100,
              videoCount: 10,
              latestPostAt: world.clock.now() - dayMs,
            },
            cost: { unit: 'units', amount: 1 },
          });
        },
        follows,
      }),
    ],
    ['scraptik', fakeSource('scraptik', { follows })],
  ]);
};

const testEnv = (overrides: Record<string, string> = {}) =>
  envSchema.parse({
    DATABASE_URL: databaseUrl ?? '',
    BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-for-better-auth',
    PUBLIC_WEB_ORIGIN: webOrigin,
    CORS_ORIGINS: webOrigin,
    LOG_LEVEL: 'silent',
    VERIFICATION_SOURCE_ORDER_PROFILE: 'ensemble',
    VERIFICATION_SOURCE_ORDER_FOLLOWS: 'ensemble,scraptik',
    VERIFICATION_SOURCE_ORDER_LIKED: 'ensemble',
    RATE_LIMIT_MAX: '1000',
    ...overrides,
  });

export interface TestApi {
  readonly app: NestFastifyApplication;
  readonly api: Api;
  readonly world: World;
  readonly close: () => Promise<void>;
}

export const startApi = async (
  overrides: Record<string, string> = {},
  logDestination?: LogDestination,
): Promise<TestApi> => {
  const world = createWorld();
  const created = await createApp(testEnv(overrides), {
    parts: { sources: sourcesOf(world), clock: world.clock },
    ...(logDestination !== undefined && { logDestination }),
  });
  if (!created.ok) throw new Error(created.error);
  const { app, api } = created.value;
  return { app, api, world, close: () => app.close() };
};

export interface Reply {
  readonly status: number;
  readonly body: unknown;
}

export const call = async (
  app: NestFastifyApplication,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  options: { readonly cookie?: string; readonly body?: unknown } = {},
): Promise<Reply> => {
  const response = await app.inject({
    method,
    url,
    headers: {
      origin: webOrigin,
      ...(options.cookie !== undefined && { cookie: options.cookie }),
    },
    ...(options.body !== undefined && { payload: options.body as object }),
  });
  return {
    status: response.statusCode,
    body: response.body === '' ? undefined : (JSON.parse(response.body) as unknown),
  };
};

export const parsed = <T>(schema: z.ZodType<T>, reply: Reply): T => schema.parse(reply.body);

export interface User {
  readonly email: string;
  readonly cookie: string;
}

const sessionCookie = (setCookie: string | string[] | undefined): string => {
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
  const session = cookies.find((cookie) => cookie.includes('session_token='));
  if (session === undefined) throw new Error('no session cookie was set');
  return session.split(';')[0] ?? '';
};

export const signUp = async (app: NestFastifyApplication): Promise<User> => {
  const email = `${randomUUID()}@example.test`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: webOrigin, 'content-type': 'application/json' },
    payload: { email, password: 'correct horse battery staple', name: 'Performer' },
  });
  if (response.statusCode !== 200) throw new Error(`sign-up answered ${response.statusCode}`);
  return { email, cookie: sessionCookie(response.headers['set-cookie']) };
};

export const signIn = async (app: NestFastifyApplication, email: string): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: webOrigin, 'content-type': 'application/json' },
    payload: { email, password: 'correct horse battery staple' },
  });
  if (response.statusCode !== 200) throw new Error(`sign-in answered ${response.statusCode}`);
  return sessionCookie(response.headers['set-cookie']);
};

const promoteToAdmin = async (api: Api, email: string): Promise<void> => {
  await api.database.db
    .update(auth_users)
    .set({ role: 'admin' })
    .where(eq(auth_users.email, email));
};

export const signUpAdmin = async (test: TestApi): Promise<User> => {
  const admin = await signUp(test.app);
  await promoteToAdmin(test.api, admin.email);
  return admin;
};

export const seedPool = async (test: TestApi): Promise<string> => {
  const handle = uniqueHandle('pool');
  const added = await test.api.verificationAccounts.addVerificationAccount({
    platform: 'tiktok',
    account: handle,
  });
  if (!added.ok) throw new Error(added.error.kind);
  return handle;
};

export const startClaim = (test: TestApi, user: User, account: string): Promise<Reply> =>
  call(test.app, 'POST', '/api/claims', {
    cookie: user.cookie,
    body: { platform: 'tiktok', account },
  });

export const verifyClaim = (test: TestApi, user: User, id: string): Promise<Reply> =>
  call(test.app, 'POST', `/api/claims/${id}/verify`, { cookie: user.cookie });
