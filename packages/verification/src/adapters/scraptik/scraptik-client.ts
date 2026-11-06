import type { SourceError } from '../../domain/outcome.ts';
import { err, type Result } from '../../domain/result.ts';
import { decodeJson, failureForStatus, type HttpClient } from '../http/http-client.ts';
import { followingPageSchema, type FollowingPage } from './scraptik-schemas.ts';

const host = 'scraptik.p.rapidapi.com';

export interface ScraptikClient {
  listFollowing(
    query: Readonly<Record<string, string>>,
    signal: AbortSignal,
  ): Promise<Result<FollowingPage, SourceError>>;
}

export interface ScraptikDeps {
  readonly http: HttpClient;
  readonly rapidApiKey: string;
}

export const scraptikClient = ({ http, rapidApiKey }: ScraptikDeps): ScraptikClient => ({
  listFollowing: async (query, signal) => {
    const url = new URL('/list-following', `https://${host}`);
    url.search = new URLSearchParams(query).toString();
    const reply = await http.get(url.toString(), signal, {
      'x-rapidapi-key': rapidApiKey,
      'x-rapidapi-host': host,
    });
    if (!reply.ok) return reply;
    return reply.value.status === 200
      ? decodeJson(reply.value, followingPageSchema)
      : err(failureForStatus(reply.value.status));
  },
});
