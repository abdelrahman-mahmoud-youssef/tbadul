import type { z } from 'zod';
import type { SourceError } from '../../domain/outcome.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import { fetchTransport, type Transport, type TransportInit } from './transport.ts';

export interface HttpReply {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
}

export type HttpResult = Promise<Result<HttpReply, SourceError>>;

export type HeaderMap = Readonly<Record<string, string>>;

export interface HttpClient {
  get(url: string, signal: AbortSignal, headers?: HeaderMap): HttpResult;
  postJson(url: string, body: unknown, signal: AbortSignal): HttpResult;
}

export interface HttpClientOptions {
  readonly headers: (url: string) => HeaderMap;
  readonly transport?: Transport;
}

const describe = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : '';
  return `${error.name}: ${error.message}${cause}`;
};

export const createHttpClient = ({
  headers,
  transport = fetchTransport,
}: HttpClientOptions): HttpClient => {
  const send = async (url: string, init: TransportInit): HttpResult => {
    try {
      const response = await transport(url, init);
      const text = await response.text();
      return ok({ status: response.status, headers: response.headers, text });
    } catch (error) {
      if (init.signal.aborted) throw error;
      return err({ kind: 'network', message: describe(error) });
    }
  };
  return {
    get: (url, signal, extra = {}) =>
      send(url, { method: 'GET', headers: { ...headers(url), ...extra }, signal }),
    postJson: (url, body, signal) =>
      send(url, {
        method: 'POST',
        headers: { ...headers(url), 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      }),
  };
};

export const decodeJson = <T>(reply: HttpReply, schema: z.ZodType<T>): Result<T, SourceError> => {
  let json: unknown;
  try {
    json = JSON.parse(reply.text);
  } catch {
    return err({ kind: 'parse', message: 'body is not JSON', httpStatus: reply.status });
  }
  const parsed = schema.safeParse(json);
  return parsed.success
    ? ok(parsed.data)
    : err({
        kind: 'parse',
        message: parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
        httpStatus: reply.status,
      });
};

export const failureForStatus = (status: number, message = `http ${status}`): SourceError => ({
  kind: status === 429 ? 'rate_limited' : status === 401 || status === 403 ? 'auth' : 'http',
  message,
  httpStatus: status,
});
