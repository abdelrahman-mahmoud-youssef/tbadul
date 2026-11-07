import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { controlOrigin, webOrigin } from './origins';

const password = 'correct horse battery staple';

const post = async (request: APIRequestContext, path: string, data: object): Promise<void> => {
  const response = await request.post(path, { data, headers: { origin: webOrigin } });
  if (!response.ok()) throw new Error(`${path} answered ${response.status()}`);
};

export type Role = 'user' | 'admin';

export const signInAs = async (request: APIRequestContext, role: Role): Promise<void> => {
  const email = `${randomUUID()}@example.test`;
  await post(request, '/api/auth/sign-up/email', { email, password, name: 'Performer' });
  if (role === 'admin') {
    const promoted = await fetch(`${controlOrigin}/admins`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    if (!promoted.ok) throw new Error(`promotion answered ${promoted.status}`);
    await post(request, '/api/auth/sign-in/email', { email, password });
  }
};
