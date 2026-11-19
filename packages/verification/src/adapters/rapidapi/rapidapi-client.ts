import type { z } from 'zod';
import type { SourceError } from '../../domain/outcome.ts';
import { err, type Result } from '../../domain/result.ts';
import { decodeJson, failureForStatus, type HttpClient } from '../http/http-client.ts';

export interface RapidApiDeps {
  readonly http: HttpClient;
  readonly rapidApiKey: string;
}

export interface RapidApiClient {
  get<T>(
    path: string,
    query: Readonly<Record<string, string>>,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<Result<T, SourceError>>;
}

export const rapidApiClient = (
  { http, rapidApiKey }: RapidApiDeps,
  host: string,
): RapidApiClient => ({
  get: async (path, query, schema, signal) => {
    const url = new URL(path, `https://${host}`);
    url.search = new URLSearchParams(query).toString();
    const reply = await http.get(url.toString(), signal, {
      'x-rapidapi-key': rapidApiKey,
      'x-rapidapi-host': host,
    });
    if (!reply.ok) return reply;
    return reply.value.status === 200
      ? decodeJson(reply.value, schema)
      : err(failureForStatus(reply.value.status));
  },
});
