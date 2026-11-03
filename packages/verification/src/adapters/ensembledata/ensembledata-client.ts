import type { z } from 'zod';
import type { SourceError } from '../../domain/outcome.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import {
  decodeJson,
  failureForStatus,
  type HttpClient,
  type HttpReply,
} from '../http/http-client.ts';
import { unitsChargedSchema } from './ensembledata-schemas.ts';

const apiBase = 'https://ensembledata.com/apis';

export type EnsembledataRead<T> =
  { readonly body: T } | { readonly outcome: 'private' | 'not_found' };

interface EnsembledataReply<T> {
  readonly unitsCharged: number;
  readonly read: Result<EnsembledataRead<T>, SourceError>;
}

export interface EnsembledataClient {
  read<T>(
    path: string,
    query: Readonly<Record<string, string>>,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<EnsembledataReply<T>>;
}

export interface EnsembledataDeps {
  readonly http: HttpClient;
  readonly token: string;
}

const privateUser = 472;
const userNotFound = 473;
const unitsDepleted = 495;
const tokenRejections: Readonly<Record<number, string>> = {
  491: 'token not found',
  492: 'email unverified',
  493: 'subscription expired',
};

const transportFailure: SourceError = { kind: 'network', message: 'ensembledata request failed' };

const unknownStatus = (status: number): SourceError => ({
  kind: 'unknown_status',
  message: `ensembledata http ${status}`,
  httpStatus: status,
});

const readReply = <T>(
  reply: HttpReply,
  schema: z.ZodType<T>,
): Result<EnsembledataRead<T>, SourceError> => {
  const rejection = tokenRejections[reply.status];
  if (rejection !== undefined) {
    return err({
      kind: 'auth',
      message: `ensembledata ${reply.status}: ${rejection}`,
      httpStatus: reply.status,
    });
  }
  switch (reply.status) {
    case 200: {
      const body = decodeJson(reply, schema);
      return body.ok ? ok({ body: body.value }) : body;
    }
    case privateUser:
      return ok({ outcome: 'private' });
    case userNotFound:
      return ok({ outcome: 'not_found' });
    case unitsDepleted:
      return err(failureForStatus(unitsDepleted, 'ensembledata 495: units depleted'));
    case 422:
    case 429:
      return err(failureForStatus(reply.status));
    default:
      return err(
        reply.status >= 500 ? failureForStatus(reply.status) : unknownStatus(reply.status),
      );
  }
};

export const ensembledataClient = ({ http, token }: EnsembledataDeps): EnsembledataClient => ({
  read: async (path, query, schema, signal) => {
    const url = new URL(`${apiBase}${path}`);
    url.search = new URLSearchParams({ ...query, token }).toString();
    const reply = await http.get(url.toString(), signal);
    if (!reply.ok) return { unitsCharged: 0, read: err(transportFailure) };
    const unitsCharged = unitsChargedSchema.safeParse(reply.value.headers.get('units_charged'));
    return unitsCharged.success
      ? { unitsCharged: unitsCharged.data, read: readReply(reply.value, schema) }
      : {
          unitsCharged: 0,
          read: err({
            kind: 'parse',
            message: 'ensembledata units_charged header is not a count',
            httpStatus: reply.value.status,
          }),
        };
  },
});
