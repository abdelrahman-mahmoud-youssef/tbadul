import { describe, expect, it } from 'vitest';
import { readEnv, type Env } from './config.ts';
import { configuredOrders, defaultOrders, planOrders } from './orders.ts';

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
