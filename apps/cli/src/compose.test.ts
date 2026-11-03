import { describe, expect, it } from 'vitest';
import { composeVerifier } from './compose.ts';
import { readEnv, type Env } from './config.ts';

const env = (source: Record<string, string>): Env => {
  const loaded = readEnv(source);
  if (!loaded.ok) throw new Error(loaded.error.join('; '));
  return loaded.value;
};

describe('composeVerifier', () => {
  it('includes lamatok when its access key is configured', () => {
    expect(composeVerifier(env({ LAMATOK_ACCESS_KEY: 'configured' }))).toMatchObject({
      ok: true,
      value: { leftOut: ['ensemble'] },
    });
  });

  it('includes ensemble when its token is configured', () => {
    expect(composeVerifier(env({ ENSEMBLEDATA_TOKEN: 'configured' }))).toMatchObject({
      ok: true,
      value: { leftOut: ['lamatok'] },
    });
  });

  it('leaves no source out when every credential is configured', () => {
    expect(
      composeVerifier(env({ LAMATOK_ACCESS_KEY: 'configured', ENSEMBLEDATA_TOKEN: 'configured' })),
    ).toMatchObject({ ok: true, value: { leftOut: [] } });
  });

  it('leaves lamatok out when its access key is missing', () => {
    expect(composeVerifier(env({}))).toMatchObject({
      ok: true,
      value: { leftOut: ['lamatok', 'ensemble'] },
    });
  });
});
