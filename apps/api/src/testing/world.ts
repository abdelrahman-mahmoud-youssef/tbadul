import { randomUUID } from 'node:crypto';
import { auth_users } from '@engagement-exchange/db';
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
import { eq } from 'drizzle-orm';
import type { Api } from '../core/compose.ts';
import { envSchema, type Env } from '../core/config.ts';

const dayMs = 86_400_000;

export interface Profile {
  readonly isPrivate?: boolean | undefined;
  readonly missing?: boolean | undefined;
  readonly followerCount?: number | undefined;
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

export const createWorld = (startsAt = Date.UTC(2026, 10, 7)): World => ({
  clock: manualClock(startsAt),
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

export const sourcesOf = (world: World): AssembledSources => {
  const follows = followsIn(world);
  return new Map<KnownSourceName, ReturnType<typeof fakeSource>>([
    [
      'ensemble',
      fakeSource('ensemble', {
        profile: (check) => {
          const handle = check.subject.value;
          if (world.failing.has(handle)) {
            return Promise.resolve({
              outcome: 'source_error',
              error: { kind: 'network', message: 'unreachable' },
            });
          }
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

export interface WorldEnvSettings {
  readonly databaseUrl: string;
  readonly webOrigin: string;
}

export const worldEnv = (settings: WorldEnvSettings, overrides: Record<string, string> = {}): Env =>
  envSchema.parse({
    DATABASE_URL: settings.databaseUrl,
    BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-for-better-auth',
    PUBLIC_WEB_ORIGIN: settings.webOrigin,
    CORS_ORIGINS: settings.webOrigin,
    LOG_LEVEL: 'silent',
    VERIFICATION_SOURCE_ORDER_PROFILE: 'ensemble',
    VERIFICATION_SOURCE_ORDER_FOLLOWS: 'ensemble,scraptik',
    VERIFICATION_SOURCE_ORDER_LIKED: 'ensemble',
    RATE_LIMIT_MAX: '1000',
    AUTH_ATTEMPTS_PER_MINUTE: '1000',
    ...overrides,
  });

export const promoteToAdmin = async (api: Api, email: string): Promise<void> => {
  await api.database.db
    .update(auth_users)
    .set({ role: 'admin' })
    .where(eq(auth_users.email, email));
};
