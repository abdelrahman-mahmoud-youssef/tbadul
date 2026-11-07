import { err, ok, type Result } from '@engagement-exchange/verification';
import {
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  type LoggerService,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyBaseLogger } from 'fastify';
import { AppModule } from './app.module.ts';
import { mountAuth } from './auth.ts';
import { composeApi, type Api, type ApiParts } from './compose.ts';
import type { Env } from './config.ts';
import { ErrorEnvelopeFilter, validationFailed } from './errors.ts';

export interface LogDestination {
  write(line: string): void;
}

export interface AppOptions {
  readonly parts?: ApiParts;
  readonly logDestination?: LogDestination;
}

export interface App {
  readonly app: NestFastifyApplication;
  readonly api: Api;
}

const redactedPaths = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.body',
  'res.headers["set-cookie"]',
];

const nestLogger = (log: FastifyBaseLogger): LoggerService => ({
  log: (message: unknown) => {
    log.info({ nest: message });
  },
  error: (message: unknown) => {
    log.error({ nest: message });
  },
  warn: (message: unknown) => {
    log.warn({ nest: message });
  },
  debug: (message: unknown) => {
    log.debug({ nest: message });
  },
  verbose: (message: unknown) => {
    log.trace({ nest: message });
  },
});

export const createApp = async (
  env: Env,
  options: AppOptions = {},
): Promise<Result<App, string>> => {
  const adapter = new FastifyAdapter({
    logger: {
      level: env.LOG_LEVEL,
      redact: { paths: redactedPaths, censor: '[redacted]' },
      ...(options.logDestination !== undefined && { stream: options.logDestination }),
    },
  });
  const fastify = adapter.getInstance();
  const composed = composeApi(
    env,
    (fields, message) => {
      fastify.log.warn(fields, message);
    },
    options.parts,
  );
  if (!composed.ok) return err(composed.error);
  const api = composed.value;
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.with(api), adapter, {
    logger: nestLogger(fastify.log),
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new StandardSchemaValidationPipe({ exceptionFactory: validationFailed }));
  app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new ErrorEnvelopeFilter());
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  fastify.addHook('onClose', () => api.database.close());
  await mountAuth(fastify, api.auth, env.PUBLIC_WEB_ORIGIN);
  await app.init();
  await fastify.ready();
  return ok({ app, api });
};
