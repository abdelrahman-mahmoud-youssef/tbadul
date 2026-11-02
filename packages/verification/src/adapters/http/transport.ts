export interface TransportInit {
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal: AbortSignal;
}

export type Transport = (url: string, init: TransportInit) => Promise<Response>;

export const fetchTransport: Transport = (url, init) => fetch(url, init);
