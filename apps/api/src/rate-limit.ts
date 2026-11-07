import rateLimit from '@fastify/rate-limit';
import {
  applyDecorators,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { HttpAdapterHost, Reflector } from '@nestjs/core';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';
import { ApiError } from './errors.ts';
import { principalOf } from './session.ts';

export interface RateLimitSettings {
  readonly max: number;
  readonly windowMs: number;
}

export const registerRateLimit = (fastify: FastifyInstance, settings: RateLimitSettings) =>
  fastify.register(rateLimit, {
    global: false,
    max: settings.max,
    timeWindow: settings.windowMs,
    keyGenerator: (request) => principalOf(request).userId,
    errorResponseBuilder: (_request, context) =>
      new ApiError({
        code: 'rate_limited',
        details: { retryAfterSeconds: Math.ceil(context.ttl / 1000) },
      }),
  });

const limitGroup = Symbol('rate-limit-group');

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly adapterHost: HttpAdapterHost;
  private readonly reflector: Reflector;
  private readonly limits = new Map<string, preHandlerAsyncHookHandler>();

  constructor(
    @Inject(HttpAdapterHost) adapterHost: HttpAdapterHost,
    @Inject(Reflector) reflector: Reflector,
  ) {
    this.adapterHost = adapterHost;
    this.reflector = reflector;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const group = this.reflector.get<string>(limitGroup, context.getHandler());
    const limit =
      this.limits.get(group) ??
      this.adapterHost.httpAdapter.getInstance<FastifyInstance>().rateLimit({ groupId: group });
    this.limits.set(group, limit);
    const http = context.switchToHttp();
    await limit.call(
      this.adapterHost.httpAdapter.getInstance<FastifyInstance>(),
      http.getRequest<FastifyRequest>(),
      http.getResponse<FastifyReply>(),
    );
    return true;
  }
}

export const RateLimited = (group: string) =>
  applyDecorators(SetMetadata(limitGroup, group), UseGuards(RateLimitGuard));
