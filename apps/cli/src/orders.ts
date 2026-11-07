import { defaultSourceOrders, type SourceOrders } from '@engagement-exchange/verification';
import type { Env, SourceChoice } from './config.ts';

export const configuredOrders = (env: Env): SourceOrders => ({
  profile:
    env.VERIFICATION_SOURCE_ORDER_PROFILE ??
    env.VERIFICATION_SOURCE_ORDER ??
    defaultSourceOrders.profile,
  follows:
    env.VERIFICATION_SOURCE_ORDER_FOLLOWS ??
    env.VERIFICATION_SOURCE_ORDER ??
    defaultSourceOrders.follows,
  liked:
    env.VERIFICATION_SOURCE_ORDER_LIKED ??
    env.VERIFICATION_SOURCE_ORDER ??
    defaultSourceOrders.liked,
});

export const ordersFor = (env: Env, choice: SourceChoice): SourceOrders =>
  choice === 'chain'
    ? configuredOrders(env)
    : { profile: [choice], follows: [choice], liked: [choice] };
