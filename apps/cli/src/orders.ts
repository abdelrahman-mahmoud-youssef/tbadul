import { err, ok, type CheckKind, type Result } from '@engagement-exchange/verification';
import type { CliSourceName, Env } from './config.ts';

export type Orders = Readonly<Record<CheckKind, readonly CliSourceName[]>>;

export const defaultOrders: Orders = {
  profile: ['lamatok', 'ensemble', 'scraper'],
  follows: ['scraper', 'lamatok', 'ensemble'],
  liked: ['scraper', 'lamatok', 'ensemble'],
};

export const configuredOrders = (env: Env): Orders => ({
  profile:
    env.VERIFICATION_SOURCE_ORDER_PROFILE ?? env.VERIFICATION_SOURCE_ORDER ?? defaultOrders.profile,
  follows:
    env.VERIFICATION_SOURCE_ORDER_FOLLOWS ?? env.VERIFICATION_SOURCE_ORDER ?? defaultOrders.follows,
  liked:
    env.VERIFICATION_SOURCE_ORDER_LIKED ?? env.VERIFICATION_SOURCE_ORDER ?? defaultOrders.liked,
});

export interface PlannedOrders {
  readonly orders: Orders;
  readonly leftOut: readonly CliSourceName[];
}

export const planOrders = (
  orders: Orders,
  available: ReadonlySet<CliSourceName>,
): Result<PlannedOrders, string> => {
  const keep = (names: readonly CliSourceName[]) => names.filter((name) => available.has(name));
  const planned: Orders = {
    profile: keep(orders.profile),
    follows: keep(orders.follows),
    liked: keep(orders.liked),
  };
  const empty = (Object.keys(planned) as CheckKind[]).find((kind) => planned[kind].length === 0);
  if (empty !== undefined) return err(`no configured source left for ${empty} checks`);
  const named = new Set([...orders.profile, ...orders.follows, ...orders.liked]);
  return ok({ orders: planned, leftOut: [...named].filter((name) => !available.has(name)) });
};
