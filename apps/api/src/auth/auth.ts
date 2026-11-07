import { authOptions, type Database } from '@engagement-exchange/db';
import { betterAuth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';

export interface AuthSettings {
  readonly secret: string;
  readonly publicOrigin: string;
}

const authBasePath = '/api/auth';

export const createAuth = (db: Database, settings: AuthSettings) =>
  betterAuth({
    ...authOptions(db),
    secret: settings.secret,
    baseURL: settings.publicOrigin,
    basePath: authBasePath,
    trustedOrigins: [settings.publicOrigin],
  });

export type Auth = ReturnType<typeof createAuth>;

export const mountAuth = async (
  fastify: FastifyInstance,
  auth: Auth,
  publicOrigin: string,
): Promise<void> => {
  await fastify.register((scope, _options, done) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, parsed) => {
      parsed(null, body);
    });
    scope.route({
      method: ['GET', 'POST'],
      url: `${authBasePath}/*`,
      handler: async (request, reply) => {
        const response = await auth.handler(
          new Request(new URL(request.url, publicOrigin), {
            method: request.method,
            headers: fromNodeHeaders(request.headers),
            ...(Buffer.isBuffer(request.body) && { body: new Uint8Array(request.body) }),
          }),
        );
        response.headers.forEach((value, key) => {
          if (key !== 'set-cookie') void reply.header(key, value);
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length > 0) void reply.header('set-cookie', cookies);
        return reply
          .status(response.status)
          .send(response.body === null ? null : Buffer.from(await response.arrayBuffer()));
      },
    });
    done();
  });
};
