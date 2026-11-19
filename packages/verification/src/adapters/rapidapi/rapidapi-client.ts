import type { z } from 'zod';
import type { SourceError } from '../../domain/outcome.ts';
import { err, type Result } from '../../domain/result.ts';
import {
  decodeJson,
  failureForStatus,
  type HttpClient,
  type HttpReply,
} from '../http/http-client.ts';

export interface RapidApiDeps {
  readonly http: HttpClient;
  readonly rapidApiKey: string;
}

type Query = Readonly<Record<string, string>>;

export interface RapidApiClient {
  read(path: string, query: Query, signal: AbortSignal): Promise<Result<HttpReply, SourceError>>;
  get<T>(
    path: string,
    query: Query,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<Result<T, SourceError>>;
}

export const rapidApiClient = (
  { http, rapidApiKey }: RapidApiDeps,
  host: string,
): RapidApiClient => {
  const read: RapidApiClient['read'] = (path, query, signal) => {
    const url = new URL(path, `https://${host}`);
    url.search = new URLSearchParams(query).toString();
    return http.get(url.toString(), signal, {
      'x-rapidapi-key': rapidApiKey,
      'x-rapidapi-host': host,
    });
  };
  return {
    read,
    get: async (path, query, schema, signal) => {
      const reply = await read(path, query, signal);
      if (!reply.ok) return reply;
      return reply.value.status === 200
        ? decodeJson(reply.value, schema)
        : err(failureForStatus(reply.value.status));
    },
  };
};
