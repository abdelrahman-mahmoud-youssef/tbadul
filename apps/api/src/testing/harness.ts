import { randomUUID } from 'node:crypto';
import { providedDatabaseUrl } from '@engagement-exchange/db/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { z } from 'zod';
import { createApp, type LogDestination } from '../app.ts';
import type { Api } from '../compose.ts';
import {
  createWorld,
  promoteToAdmin,
  sourcesOf,
  uniqueHandle,
  worldEnv,
  type World,
} from './world.ts';

export { follow, idOf, uniqueHandle, type World } from './world.ts';

export const databaseUrl = providedDatabaseUrl();

export const webOrigin = 'http://localhost:3000';

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
  const created = await createApp(
    worldEnv({ databaseUrl: databaseUrl ?? '', webOrigin }, overrides),
    {
      parts: { sources: sourcesOf(world), clock: world.clock },
      ...(logDestination !== undefined && { logDestination }),
    },
  );
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
