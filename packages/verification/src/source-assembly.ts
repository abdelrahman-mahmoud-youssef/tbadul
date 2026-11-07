import { ensembledataSource } from './adapters/ensembledata/ensembledata-source.ts';
import type { HttpClient } from './adapters/http/http-client.ts';
import { lamatokSource } from './adapters/lamatok/lamatok-source.ts';
import { scraperSource } from './adapters/scraper/scraper-source.ts';
import { sidecarSigner } from './adapters/scraper/sidecar/sidecar-signer.ts';
import { scraptikSource } from './adapters/scraptik/scraptik-source.ts';
import { checkKinds, type CheckKind } from './domain/check.ts';
import { err, ok, type Result } from './domain/result.ts';
import type { VerificationSource } from './ports/verification-source.ts';

export const knownSourceNames = ['scraper', 'lamatok', 'ensemble', 'scraptik'] as const;

export type KnownSourceName = (typeof knownSourceNames)[number];

export type SourceOrders = Readonly<Record<CheckKind, readonly KnownSourceName[]>>;

export const defaultSourceOrders: SourceOrders = {
  profile: ['ensemble', 'scraper'],
  follows: ['scraper', 'ensemble', 'scraptik'],
  liked: ['scraper', 'ensemble'],
};

export interface PlannedSourceOrders {
  readonly orders: SourceOrders;
  readonly leftOut: readonly KnownSourceName[];
}

export interface NoSourceLeft {
  readonly kind: 'no_source_left';
  readonly check: CheckKind;
}

export const planSourceOrders = (
  orders: SourceOrders,
  available: ReadonlySet<KnownSourceName>,
): Result<PlannedSourceOrders, NoSourceLeft> => {
  const keep = (names: readonly KnownSourceName[]) => names.filter((name) => available.has(name));
  const planned: SourceOrders = {
    profile: keep(orders.profile),
    follows: keep(orders.follows),
    liked: keep(orders.liked),
  };
  const empty = checkKinds.find((kind) => planned[kind].length === 0);
  if (empty !== undefined) return err({ kind: 'no_source_left', check: empty });
  const named = new Set([...orders.profile, ...orders.follows, ...orders.liked]);
  return ok({ orders: planned, leftOut: [...named].filter((name) => !available.has(name)) });
};

export interface SourceCredentials {
  readonly signerUrl: string;
  readonly lamatokKey?: string | undefined;
  readonly ensembleToken?: string | undefined;
  readonly scraptikKey?: string | undefined;
}

export type AssembledSources = ReadonlyMap<KnownSourceName, VerificationSource>;

export const assembleSources = (
  credentials: SourceCredentials,
  http: HttpClient,
): AssembledSources => {
  const sources = new Map<KnownSourceName, VerificationSource>([
    ['scraper', scraperSource({ http, signer: sidecarSigner(http, credentials.signerUrl) })],
  ]);
  if (credentials.lamatokKey !== undefined) {
    sources.set('lamatok', lamatokSource({ http, accessKey: credentials.lamatokKey }));
  }
  if (credentials.ensembleToken !== undefined) {
    sources.set('ensemble', ensembledataSource({ http, token: credentials.ensembleToken }));
  }
  if (credentials.scraptikKey !== undefined) {
    sources.set('scraptik', scraptikSource({ http, rapidApiKey: credentials.scraptikKey }));
  }
  return sources;
};
