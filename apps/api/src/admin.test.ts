import {
  addPoolAccountResponse,
  claimResponse,
  errorEnvelope,
  fallbacksResponse,
  poolAccountResponse,
  poolResponse,
} from '@engagement-exchange/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  call,
  databaseUrl,
  idOf,
  parsed,
  seedPool,
  signUp,
  signUpAdmin,
  startApi,
  startClaim,
  uniqueHandle,
  verifyClaim,
  type TestApi,
  type User,
} from './testing/harness.ts';

describe.skipIf(databaseUrl === null)('administration', () => {
  let test: TestApi;
  let admin: User;

  beforeEach(async () => {
    test = await startApi();
    admin = await signUpAdmin(test);
  });

  afterEach(async () => {
    await test.close();
  });

  it('adds, lists, deactivates and re-adds a verification account', async () => {
    const handle = uniqueHandle('pool');
    const add = () =>
      call(test.app, 'POST', '/api/admin/pool', {
        cookie: admin.cookie,
        body: { platform: 'tiktok', account: `@${handle}` },
      });

    const added = await add();
    const again = await add();
    const deactivated = await call(test.app, 'PATCH', `/api/admin/pool/${idOf(handle).value}`, {
      cookie: admin.cookie,
      body: { platform: 'tiktok', active: false },
    });
    const inactive = await add();
    const listed = await call(test.app, 'GET', '/api/admin/pool', { cookie: admin.cookie });

    expect(added.status).toBe(201);
    expect(parsed(addPoolAccountResponse, added)).toEqual({
      account: { accountId: idOf(handle).value, handle },
      status: 'added',
    });
    expect(parsed(addPoolAccountResponse, again).status).toBe('present');
    expect(parsed(poolAccountResponse, deactivated).account).toMatchObject({
      accountId: idOf(handle).value,
      active: false,
    });
    expect(parsed(addPoolAccountResponse, inactive).status).toBe('inactive');
    expect(parsed(poolResponse, listed).pools).toEqual([
      {
        platform: 'tiktok',
        accounts: expect.arrayContaining([
          { accountId: idOf(handle).value, handle, active: false, assignedCount: 0 },
        ]) as unknown,
      },
    ]);
  });

  it('answers not_found for an account outside the pool', async () => {
    const missing = await call(test.app, 'PATCH', '/api/admin/pool/id-nobody', {
      cookie: admin.cookie,
      body: { platform: 'tiktok', active: true },
    });

    expect(missing.status).toBe(404);
    expect(errorEnvelope.parse(missing.body).error).toEqual({ code: 'not_found' });
  });

  it('counts source errors per source per hour', async () => {
    await seedPool(test);
    const user = await signUp(test.app);
    const handle = uniqueHandle('creator');
    const claim = parsed(claimResponse, await startClaim(test, user, handle)).claim;
    test.world.failing.add(handle);
    await verifyClaim(test, user, claim.id);

    const fallbacks = await call(test.app, 'GET', '/api/admin/fallbacks', {
      cookie: admin.cookie,
    });

    const hour = new Date(Math.floor(test.world.clock.now() / 3_600_000) * 3_600_000);
    expect(parsed(fallbacksResponse, fallbacks).counts).toEqual([
      { source: 'ensemble', hour: hour.toISOString(), count: 1 },
      { source: 'scraptik', hour: hour.toISOString(), count: 1 },
    ]);
  });

  it('refuses a user with forbidden and an anonymous caller with unauthorized', async () => {
    const user = await signUp(test.app);
    const requests = [
      ['GET', '/api/admin/pool'],
      ['POST', '/api/admin/pool'],
      ['PATCH', '/api/admin/pool/id-anyone'],
      ['GET', '/api/admin/fallbacks'],
    ] as const;

    for (const [method, url] of requests) {
      const forbidden = await call(test.app, method, url, {
        cookie: user.cookie,
        body: { platform: 'tiktok', account: 'someone', active: true },
      });
      const anonymous = await call(test.app, method, url);

      expect(forbidden.status).toBe(403);
      expect(errorEnvelope.parse(forbidden.body).error).toEqual({ code: 'forbidden' });
      expect(anonymous.status).toBe(401);
      expect(errorEnvelope.parse(anonymous.body).error).toEqual({ code: 'unauthorized' });
    }
  });
});
