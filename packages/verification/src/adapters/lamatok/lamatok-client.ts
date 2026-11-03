import type { z } from 'zod';
import type { SourceError } from '../../domain/outcome.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import {
  decodeJson,
  failureForStatus,
  type HttpClient,
  type HttpReply,
} from '../http/http-client.ts';
import { errorBodySchema } from './lamatok-schemas.ts';

export const lamatokOrigin = 'https://api.lamatok.com';

type LamatokRead<T> = { readonly found: true; readonly body: T } | { readonly found: false };

export interface LamatokClient {
  read<T>(
    path: string,
    query: Readonly<Record<string, string>>,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<Result<LamatokRead<T>, SourceError>>;
}

export interface LamatokDeps {
  readonly http: HttpClient;
  readonly accessKey: string;
}

const insufficientFunds = 402;

const profileUnavailable = (reply: HttpReply): boolean => {
  const body = decodeJson(reply, errorBodySchema);
  return body.ok && body.value.exc_type === 'ProfileUnavailable';
};

const readReply = <T>(
  reply: HttpReply,
  schema: z.ZodType<T>,
): Result<LamatokRead<T>, SourceError> => {
  switch (reply.status) {
    case 200: {
      const body = decodeJson(reply, schema);
      return body.ok ? ok({ found: true, body: body.value }) : body;
    }
    case 404:
      return profileUnavailable(reply)
        ? err(failureForStatus(404, 'lamatok 404: profile unavailable'))
        : ok({ found: false });
    case insufficientFunds:
      return err(failureForStatus(insufficientFunds, 'lamatok 402: insufficient funds'));
    default:
      return err(failureForStatus(reply.status));
  }
};

export const lamatokClient = ({ http, accessKey }: LamatokDeps): LamatokClient => ({
  read: async (path, query, schema, signal) => {
    const url = new URL(path, lamatokOrigin);
    url.search = new URLSearchParams(query).toString();
    const reply = await http.get(url.toString(), signal, { 'x-access-key': accessKey });
    return reply.ok ? readReply(reply.value, schema) : reply;
  },
});
