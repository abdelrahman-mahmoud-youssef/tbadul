import { describe, expect, it } from 'vitest';
import { createHttpClient } from './adapters/http/http-client.ts';
import { assembleSources, defaultSourceOrders, planSourceOrders } from './source-assembly.ts';

const http = createHttpClient({ headers: () => ({}) });

describe('assembleSources', () => {
  it('assembles the scraper alone without credentials', () => {
    const sources = assembleSources({ signerUrl: 'http://localhost:8080' }, http);

    expect([...sources.keys()]).toEqual(['scraper']);
    expect(sources.get('scraper')?.name).toBe('scraper');
  });

  it('assembles each source whose credential is given, under its own name', () => {
    const sources = assembleSources(
      {
        signerUrl: 'http://localhost:8080',
        lamatokKey: 'configured',
        ensembleTokens: ['configured'],
        scraptikKey: 'configured',
      },
      http,
    );

    expect([...sources.entries()].map(([key, source]) => [key, source.name])).toEqual([
      ['scraper', 'scraper'],
      ['lamatok', 'lamatok'],
      ['ensemble', 'ensemble'],
      ['scraptik', 'scraptik'],
    ]);
  });
});

describe('planSourceOrders', () => {
  it('leaves out sources that are not available and names them once', () => {
    expect(planSourceOrders(defaultSourceOrders, new Set(['scraper', 'ensemble']))).toEqual({
      ok: true,
      value: {
        orders: {
          profile: ['ensemble', 'scraper'],
          follows: ['scraper', 'ensemble'],
          liked: ['scraper', 'ensemble'],
        },
        leftOut: ['scraptik'],
      },
    });
  });

  it('refuses when a kind has no source left', () => {
    expect(
      planSourceOrders({ ...defaultSourceOrders, profile: ['lamatok'] }, new Set(['scraper'])),
    ).toEqual({ ok: false, error: { kind: 'no_source_left', check: 'profile' } });
  });
});
