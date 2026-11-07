import type { ApiError as ApiErrorBody, ErrorCode } from '@engagement-exchange/contracts';
import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
  type StandardSchemaValidationPipeOptions,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

type Issue = Parameters<
  NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>
>[0][number];

type PathSegment = NonNullable<Issue['path']>[number];

const statusOf: Readonly<Record<ErrorCode, number>> = {
  cooldown_active: 429,
  eligibility_failed: 422,
  limit_reached: 409,
  account_owned_elsewhere: 409,
  account_already_linked: 409,
  account_unavailable: 422,
  pool_exhausted: 409,
  claim_expired: 410,
  claim_not_found: 404,
  claim_not_verifiable: 409,
  claim_not_cancellable: 409,
  invalid_handle: 422,
  source_unavailable: 503,
  conflict: 409,
  unauthorized: 401,
  forbidden: 403,
  validation_failed: 400,
  rate_limited: 429,
  not_found: 404,
  internal: 500,
};

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(body: ApiErrorBody) {
    super(body.code);
    this.status = statusOf[body.code];
    this.body = body;
  }
}

export const iso = (at: number): string => new Date(at).toISOString();

const segment = (part: PathSegment): string | number => {
  const key = typeof part === 'object' ? part.key : part;
  return typeof key === 'number' ? key : String(key);
};

export const validationFailed = (issues: readonly Issue[]): ApiError =>
  new ApiError({
    code: 'validation_failed',
    details: {
      issues: issues.map((issue) => ({
        path: (issue.path ?? []).map(segment),
        code: 'code' in issue && typeof issue.code === 'string' ? issue.code : 'invalid',
      })),
    },
  });

const byStatus = (status: number): ApiError => {
  switch (status) {
    case 401:
      return new ApiError({ code: 'unauthorized' });
    case 403:
      return new ApiError({ code: 'forbidden' });
    case 404:
      return new ApiError({ code: 'not_found' });
    default:
      return status < 500
        ? new ApiError({
            code: 'validation_failed',
            details: { issues: [{ path: [], code: 'invalid_request' }] },
          })
        : new ApiError({ code: 'internal' });
  }
};

const statusCodeOf = (error: unknown): number | undefined =>
  error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined;

export const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error;
  if (error instanceof HttpException) return byStatus(error.getStatus());
  return byStatus(statusCodeOf(error) ?? 500);
};

@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const failure = toApiError(error);
    if (failure.body.code === 'internal') {
      http.getRequest<FastifyRequest>().log.error({ err: error }, 'request failed');
    }
    void http.getResponse<FastifyReply>().status(failure.status).send({ error: failure.body });
  }
}
