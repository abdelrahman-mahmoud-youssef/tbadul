import { defaultSourceOrders } from '@engagement-exchange/verification';
import { describe, expect, it } from 'vitest';
import { readEnv, type Env } from './config.ts';
import { configuredOrders, ordersFor } from './orders.ts';

const env = (source: Record<string, string>): Env => {
  const loaded = readEnv(source);
  if (!loaded.ok) throw new Error(loaded.error.join('; '));
  return loaded.value;
};

describe('configuredOrders', () => {
  it('uses the defaults when nothing is set', () => {
    expect(configuredOrders(env({}))).toEqual(defaultSourceOrders);
  });

  it('falls back to the general order for every kind', () => {
    expect(configuredOrders(env({ VERIFICATION_SOURCE_ORDER: 'ensemble,scraper' }))).toEqual({
      profile: ['ensemble', 'scraper'],
      follows: ['ensemble', 'scraper'],
      liked: ['ensemble', 'scraper'],
    });
  });

  it('prefers the order of the kind over the general one', () => {
    expect(
      configuredOrders(
        env({
          VERIFICATION_SOURCE_ORDER: 'scraper',
          VERIFICATION_SOURCE_ORDER_PROFILE: 'lamatok,scraper',
        }),
      ),
    ).toEqual({ profile: ['lamatok', 'scraper'], follows: ['scraper'], liked: ['scraper'] });
  });
});

describe('ordersFor', () => {
  it('uses the configured orders for the chain', () => {
    const configured = env({ VERIFICATION_SOURCE_ORDER_FOLLOWS: 'lamatok' });
    expect(ordersFor(configured, 'chain')).toEqual(configuredOrders(configured));
  });

  it('uses the named source alone for every kind', () => {
    expect(ordersFor(env({ VERIFICATION_SOURCE_ORDER: 'scraper' }), 'ensemble')).toEqual({
      profile: ['ensemble'],
      follows: ['ensemble'],
      liked: ['ensemble'],
    });
  });
});
