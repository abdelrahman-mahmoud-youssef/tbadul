import { describe, expect, it } from 'vitest';
import { composeVerifier } from './compose.ts';
import { readEnv, type Env } from './config.ts';

const env = (source: Record<string, string>): Env => {
  const loaded = readEnv(source);
  if (!loaded.ok) throw new Error(loaded.error.join('; '));
  return loaded.value;
};

describe('composeVerifier', () => {
  it('confirms follows with ensemble when its token is configured', () => {
    expect(composeVerifier(env({ ENSEMBLEDATA_TOKEN: 'configured' }))).toMatchObject({
      ok: true,
      value: { leftOut: ['scraptik'], unconfirmed: [] },
    });
  });

  it('confirms follows but not liked with scraptik alone, which answers follows only', () => {
    expect(composeVerifier(env({ SCRAPTIK_RAPIDAPI_KEY: 'configured' }))).toMatchObject({
      ok: true,
      value: { leftOut: ['ensemble'], unconfirmed: ['liked'] },
    });
  });

  it('leaves no source out when every default credential is configured', () => {
    expect(
      composeVerifier(
        env({ ENSEMBLEDATA_TOKEN: 'configured', SCRAPTIK_RAPIDAPI_KEY: 'configured' }),
      ),
    ).toMatchObject({ ok: true, value: { leftOut: [], unconfirmed: [] } });
  });

  it('reports no confirmer when only the scraper can read a following list', () => {
    expect(composeVerifier(env({}))).toMatchObject({
      ok: true,
      value: { leftOut: ['ensemble', 'scraptik'], unconfirmed: ['follows', 'liked'] },
    });
  });

  it('needs no confirmer when confirmation is switched off', () => {
    expect(composeVerifier(env({ VERIFICATION_CONFIRM_NOT_FOLLOWING: 'false' }))).toMatchObject({
      ok: true,
      value: { unconfirmed: [] },
    });
  });

  it('counts every configured source that answers the check kind as a confirmer', () => {
    expect(
      composeVerifier(
        env({ LAMATOK_ACCESS_KEY: 'configured', VERIFICATION_SOURCE_ORDER: 'scraper,lamatok' }),
      ),
    ).toMatchObject({ ok: true, value: { leftOut: [], unconfirmed: [] } });
  });

  it('names a configured source that no order uses', () => {
    expect(
      composeVerifier(env({ LAMATOK_ACCESS_KEY: 'configured', ENSEMBLEDATA_TOKEN: 'configured' })),
    ).toMatchObject({ ok: true, value: { unused: ['lamatok'] } });
  });

  it('uses lamatok once an order names it', () => {
    expect(
      composeVerifier(
        env({
          LAMATOK_ACCESS_KEY: 'configured',
          VERIFICATION_SOURCE_ORDER_FOLLOWS: 'scraper,lamatok',
        }),
      ),
    ).toMatchObject({ ok: true, value: { unused: [] } });
  });

  it('leaves nothing out when one configured source is named', () => {
    expect(
      composeVerifier(env({ LAMATOK_ACCESS_KEY: 'configured' }), undefined, 'lamatok'),
    ).toMatchObject({ ok: true, value: { leftOut: [] } });
  });

  it('names a chosen source whose credential is missing', () => {
    expect(composeVerifier(env({}), undefined, 'scraptik')).toEqual({
      ok: false,
      error: 'source scraptik has no credential configured',
    });
  });
});
