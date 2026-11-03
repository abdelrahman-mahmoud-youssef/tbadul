import { describe, expect, it } from 'vitest';
import { readEnv, type Env } from './config.ts';
import { configuredOrders, defaultOrders, ordersFor, planOrders } from './orders.ts';

const env = (source: Record<string, string>): Env => {
  const loaded = readEnv(source);
  if (!loaded.ok) throw new Error(loaded.error.join('; '));
  return loaded.value;
};

describe('configuredOrders', () => {
  it('uses the defaults when nothing is set', () => {
    expect(configuredOrders(env({}))).toEqual(defaultOrders);
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

describe('planOrders', () => {
  it('leaves out sources that are not available and names them once', () => {
    expect(planOrders(defaultOrders, new Set(['scraper', 'lamatok']))).toEqual({
      ok: true,
      value: {
        orders: {
          profile: ['lamatok', 'scraper'],
          follows: ['scraper', 'lamatok'],
          liked: ['scraper', 'lamatok'],
        },
        leftOut: ['ensemble'],
      },
    });
  });

  it('refuses when a kind has no source left', () => {
    expect(planOrders({ ...defaultOrders, profile: ['lamatok'] }, new Set(['scraper']))).toEqual({
      ok: false,
      error: 'no configured source left for profile checks',
    });
  });
});
