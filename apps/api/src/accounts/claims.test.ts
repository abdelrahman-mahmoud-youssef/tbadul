import {
  claimResponse,
  errorEnvelope,
  linkedAccountsResponse,
  verifyClaimResponse,
} from '@engagement-exchange/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  call,
  databaseUrl,
  follow,
  parsed,
  seedPool,
  signUp,
  startApi,
  startClaim,
  uniqueHandle,
  verifyClaim,
  type TestApi,
  type User,
} from '../testing/harness.ts';

const errorOf = (reply: { readonly body: unknown }) => errorEnvelope.parse(reply.body).error;

describe.skipIf(databaseUrl === null)('claims', () => {
  let test: TestApi;
  let user: User;

  beforeEach(async () => {
    test = await startApi();
    await seedPool(test);
    user = await signUp(test.app);
  });

  afterEach(async () => {
    await test.close();
  });

  const started = async (account: string, by: User = user) => {
    const reply = await startClaim(test, by, account);
    expect(reply.status).toBe(201);
    return parsed(claimResponse, reply).claim;
  };

  it('links an account from a profile URL through a failed verify, the cooldown and a follow', async () => {
    const handle = uniqueHandle('creator');
    const retryAt = new Date(test.world.clock.now() + 30_000).toISOString();

    const claim = await started(`https://www.tiktok.com/@${handle}?lang=en`);
    const first = await verifyClaim(test, user, claim.id);
    const early = await verifyClaim(test, user, claim.id);
    follow(test.world, handle, claim.verificationAccount?.handle ?? '');
    test.world.clock.advance(30_000);
    const second = await verifyClaim(test, user, claim.id);
    const listed = await call(test.app, 'GET', '/api/linked-accounts', { cookie: user.cookie });

    expect(claim).toMatchObject({ handle, state: 'awaiting_follow', attempts: [] });
    expect(claim.eligibility.eligible).toBe(true);
    expect(first.status).toBe(200);
    expect(parsed(verifyClaimResponse, first)).toMatchObject({
      outcome: 'not_following',
      claim: { state: 'awaiting_follow', attempts: [{ outcome: 'not_following' }] },
      nextAllowedAt: retryAt,
    });
    expect(early.status).toBe(429);
    expect(errorOf(early)).toEqual({
      code: 'cooldown_active',
      details: { retryAt, waitMs: 30_000 },
    });
    expect(parsed(verifyClaimResponse, second)).toMatchObject({
      outcome: 'verified',
      claim: { state: 'verified' },
    });
    expect(parsed(linkedAccountsResponse, listed).platforms).toEqual([
      expect.objectContaining({
        platform: 'tiktok',
        limit: 5,
        used: 1,
        accounts: [expect.objectContaining({ handle, claimId: claim.id })],
        openClaims: [],
      }),
    ]);
  });

  it('refuses a sixth account with limit_reached', async () => {
    for (let index = 0; index < 5; index += 1) await started(uniqueHandle('creator'));

    const sixth = await startClaim(test, user, uniqueHandle('creator'));

    expect(sixth.status).toBe(409);
    expect(errorOf(sixth)).toEqual({ code: 'limit_reached', details: { limit: 5 } });
  });

  it('lets one of two racing users own an account and refuses the other', async () => {
    const handle = uniqueHandle('contested');
    const rival = await signUp(test.app);
    const mine = await started(handle);
    const theirs = await started(handle, rival);
    test.world.followsEveryone.add(handle);

    const replies = await Promise.all([
      verifyClaim(test, user, mine.id),
      verifyClaim(test, rival, theirs.id),
    ]);

    const statuses = replies.map((reply) => reply.status).sort();
    expect(statuses).toEqual([200, 409]);
    const refused = replies.find((reply) => reply.status === 409);
    expect(refused && errorOf(refused)).toEqual({ code: 'account_owned_elsewhere' });
  });

  it('refuses to start a claim on an account already linked, by its owner or anyone else', async () => {
    const handle = uniqueHandle('linked');
    const claim = await started(handle);
    test.world.followsEveryone.add(handle);
    await verifyClaim(test, user, claim.id);

    const again = await startClaim(test, user, handle);
    const other = await startClaim(test, await signUp(test.app), handle);

    expect(again.status).toBe(409);
    expect(errorOf(again)).toEqual({ code: 'account_already_linked' });
    expect(other.status).toBe(409);
    expect(errorOf(other)).toEqual({ code: 'account_owned_elsewhere' });
  });

  it('cancels an open claim and then refuses to cancel or verify it', async () => {
    const claim = await started(uniqueHandle('creator'));

    const cancelled = await call(test.app, 'DELETE', `/api/claims/${claim.id}`, {
      cookie: user.cookie,
    });
    const twice = await call(test.app, 'DELETE', `/api/claims/${claim.id}`, {
      cookie: user.cookie,
    });
    const verified = await verifyClaim(test, user, claim.id);

    expect(parsed(claimResponse, cancelled).claim.state).toBe('cancelled');
    expect(twice.status).toBe(409);
    expect(errorOf(twice)).toEqual({
      code: 'claim_not_cancellable',
      details: { state: 'cancelled' },
    });
    expect(verified.status).toBe(409);
    expect(errorOf(verified)).toEqual({
      code: 'claim_not_verifiable',
      details: { state: 'cancelled' },
    });
  });

  it('removes a linked account, frees its slot and refuses to remove it twice', async () => {
    const handle = uniqueHandle('creator');
    const claim = await started(handle);
    follow(test.world, handle, claim.verificationAccount?.handle ?? '');
    await verifyClaim(test, user, claim.id);

    const removed = await call(test.app, 'DELETE', `/api/linked-accounts/${claim.id}`, {
      cookie: user.cookie,
    });
    const twice = await call(test.app, 'DELETE', `/api/linked-accounts/${claim.id}`, {
      cookie: user.cookie,
    });
    const listed = await call(test.app, 'GET', '/api/linked-accounts', { cookie: user.cookie });

    expect(parsed(claimResponse, removed).claim.state).toBe('cancelled');
    expect(twice.status).toBe(409);
    expect(errorOf(twice)).toEqual({
      code: 'claim_not_cancellable',
      details: { state: 'cancelled' },
    });
    expect(parsed(linkedAccountsResponse, listed).platforms[0]).toMatchObject({
      used: 0,
      accounts: [],
    });
  });

  it('refuses to remove an account that is not linked yet or belongs to another user', async () => {
    const open = await started(uniqueHandle('creator'));
    const asOwner = await call(test.app, 'DELETE', `/api/linked-accounts/${open.id}`, {
      cookie: user.cookie,
    });
    const asAnonymous = await call(test.app, 'DELETE', `/api/linked-accounts/${open.id}`);

    expect(asOwner.status).toBe(409);
    expect(errorOf(asOwner)).toEqual({
      code: 'claim_not_cancellable',
      details: { state: 'awaiting_follow' },
    });
    expect(asAnonymous.status).toBe(401);
  });

  it('answers eligibility_failed with every rule and keeps the claim readable', async () => {
    const handle = uniqueHandle('small');
    test.world.profiles.set(handle, { followerCount: 1 });

    const refused = await startClaim(test, user, handle);
    const error = errorOf(refused);
    if (error.code !== 'eligibility_failed') throw new Error(error.code);
    const stored = await call(test.app, 'GET', `/api/claims/${error.details.claimId}`, {
      cookie: user.cookie,
    });

    expect(refused.status).toBe(422);
    expect(error.details.results).toEqual([
      { rule: 'public_account', result: 'pass' },
      { rule: 'following_visible', result: 'pass' },
      { rule: 'min_followers', result: 'fail', reason: 'followers_below_minimum' },
      { rule: 'min_posts', result: 'pass' },
      { rule: 'recent_activity', result: 'pass' },
    ]);
    expect(parsed(claimResponse, stored).claim.state).toBe('eligibility_failed');
  });

  it('answers pool_exhausted when the account already follows every verification account', async () => {
    const handle = uniqueHandle('follower');
    test.world.followsEveryone.add(handle);

    const refused = await startClaim(test, user, handle);

    expect(refused.status).toBe(409);
    expect(errorOf(refused)).toEqual({ code: 'pool_exhausted' });
  });

  it('answers account_unavailable for an account that does not exist', async () => {
    const handle = uniqueHandle('missing');
    test.world.profiles.set(handle, { missing: true });

    const refused = await startClaim(test, user, handle);

    expect(refused.status).toBe(422);
    expect(errorOf(refused)).toEqual({
      code: 'account_unavailable',
      details: { outcome: 'not_found' },
    });
  });

  it('answers invalid_handle for an account the platform cannot name', async () => {
    const refused = await startClaim(test, user, 'not a handle');

    expect(refused.status).toBe(422);
    expect(errorOf(refused)).toEqual({ code: 'invalid_handle', details: { reason: 'characters' } });
  });

  it('hides another user claim behind claim_not_found', async () => {
    const claim = await started(uniqueHandle('creator'));

    const foreign = await call(test.app, 'GET', `/api/claims/${claim.id}`, {
      cookie: (await signUp(test.app)).cookie,
    });

    expect(foreign.status).toBe(404);
    expect(errorOf(foreign)).toEqual({ code: 'claim_not_found' });
  });

  it('answers claim_expired once the claim outlives its lifetime', async () => {
    const claim = await started(uniqueHandle('creator'));
    test.world.clock.advance(86_400_000);

    const expired = await verifyClaim(test, user, claim.id);

    expect(expired.status).toBe(410);
    expect(errorOf(expired)).toEqual({ code: 'claim_expired' });
  });

  it('answers source_unavailable and counts nothing when every source fails', async () => {
    const handle = uniqueHandle('creator');
    const claim = await started(handle);
    test.world.failing.add(handle);

    const failed = await verifyClaim(test, user, claim.id);
    const stored = await call(test.app, 'GET', `/api/claims/${claim.id}`, { cookie: user.cookie });

    expect(failed.status).toBe(503);
    expect(errorOf(failed)).toEqual({ code: 'source_unavailable' });
    expect(parsed(claimResponse, stored).claim).toEqual(claim);
  });

  it('answers conflict to the second of two concurrent verifies of one claim', async () => {
    const claim = await started(uniqueHandle('creator'));
    let release: () => void = () => undefined;
    test.world.gate = new Promise((resolve) => {
      release = resolve;
    });
    test.world.entered.count = 0;

    const replies = Promise.all([
      verifyClaim(test, user, claim.id),
      verifyClaim(test, user, claim.id),
    ]);
    while (test.world.entered.count < 2) await new Promise((resolve) => setTimeout(resolve, 5));
    release();
    const [first, second] = await replies;

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const refused = first.status === 409 ? first : second;
    expect(errorOf(refused)).toEqual({ code: 'conflict' });
  });

  it('answers validation_failed for a malformed request and not_found for an unknown route', async () => {
    const unknownPlatform = await call(test.app, 'POST', '/api/claims', {
      cookie: user.cookie,
      body: { platform: 'myspace', account: 'someone' },
    });
    const badId = await call(test.app, 'GET', '/api/claims/not-a-uuid', { cookie: user.cookie });
    const badJson = await test.app.inject({
      method: 'POST',
      url: '/api/claims',
      headers: { cookie: user.cookie, 'content-type': 'application/json' },
      payload: '{"platform":',
    });
    const unknown = await call(test.app, 'GET', '/api/nothing-here', { cookie: user.cookie });

    expect(unknownPlatform.status).toBe(400);
    expect(errorOf(unknownPlatform)).toEqual({
      code: 'validation_failed',
      details: { issues: [{ path: ['platform'], code: 'invalid_value' }] },
    });
    expect(badId.status).toBe(400);
    expect(errorOf(badId).code).toBe('validation_failed');
    expect(badJson.statusCode).toBe(400);
    expect(errorEnvelope.parse(badJson.json()).error.code).toBe('validation_failed');
    expect(unknown.status).toBe(404);
    expect(errorOf(unknown)).toEqual({ code: 'not_found' });
  });
});
