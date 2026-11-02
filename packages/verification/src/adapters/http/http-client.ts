import type { z } from 'zod';
import type { SourceError } from '../../domain/outcome.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import { fetchTransport, type Transport } from './transport.ts';

export interface HttpReply {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
}

export interface HttpClient {
  get(url: string, signal: AbortSignal): Promise<Result<HttpReply, SourceError>>;
}

export interface HttpClientOptions {
  readonly headers: (url: string) => Readonly<Record<string, string>>;
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
}: HttpClientOptions): HttpClient => ({
  get: async (url, signal) => {
    try {
      const response = await transport(url, { headers: headers(url), signal });
      const text = await response.text();
      return ok({ status: response.status, headers: response.headers, text });
    } catch (error) {
      if (signal.aborted) throw error;
      return err({ kind: 'network', message: describe(error) });
    }
  },
});

export const decodeJson = <T>(reply: HttpReply, schema: z.ZodType<T>): Result<T, SourceError> => {
  let json: unknown;
  try {
    json = JSON.parse(reply.text);
  } catch (error) {
    return err({ kind: 'parse', message: describe(error), httpStatus: reply.status });
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
