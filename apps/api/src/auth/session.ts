import type { UserRole } from '@engagement-exchange/contracts';
import { userId, type UserId } from '@engagement-exchange/social-accounts';
import {
  createParamDecorator,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import type { Api } from '../core/compose.ts';
import { API } from '../core/tokens.ts';
import { ApiError } from '../http/errors.ts';

export interface Principal {
  readonly userId: UserId;
  readonly role: UserRole;
  readonly email: string;
  readonly name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

const publicRoute = Symbol('public-route');

export const Public = () => SetMetadata(publicRoute, true);

const requestOf = (context: ExecutionContext): FastifyRequest =>
  context.switchToHttp().getRequest<FastifyRequest>();

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly api: Api;
  private readonly reflector: Reflector;

  constructor(@Inject(API) api: Api, @Inject(Reflector) reflector: Reflector) {
    this.api = api;
    this.reflector = reflector;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const open = this.reflector.getAllAndOverride<boolean | undefined>(publicRoute, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (open === true) return true;
    const request = requestOf(context);
    const session = await this.api.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (session === null) throw new ApiError({ code: 'unauthorized' });
    const { user } = session;
    request.principal = {
      userId: userId(user.id),
      role: user.role === 'admin' ? 'admin' : 'user',
      email: user.email,
      name: user.name,
    };
    return true;
  }
}

export const principalOf = (request: FastifyRequest): Principal => {
  if (request.principal === undefined) throw new ApiError({ code: 'unauthorized' });
  return request.principal;
};

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (principalOf(requestOf(context)).role !== 'admin') {
      throw new ApiError({ code: 'forbidden' });
    }
    return true;
  }
}

export const Caller = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  principalOf(requestOf(context)),
);
