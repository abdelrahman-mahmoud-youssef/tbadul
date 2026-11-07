import { healthResponse, type HealthResponse } from '@engagement-exchange/contracts';
import { migrationsApplied } from '@engagement-exchange/db';
import { Controller, Get, Inject, Res, SerializeOptions } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Api } from './compose.ts';
import { Public } from './session.ts';
import { API } from './tokens.ts';

@Controller('health')
@Public()
export class HealthController {
  private readonly api: Api;

  constructor(@Inject(API) api: Api) {
    this.api = api;
  }

  @Get()
  @SerializeOptions({ schema: healthResponse })
  async health(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthResponse> {
    const up = await migrationsApplied(this.api.database.db).catch(() => false);
    if (!up) void reply.status(503);
    const { configured, leftOut, orders } = this.api.sources;
    return {
      status: up ? 'ok' : 'degraded',
      database: up ? 'up' : 'down',
      sources: {
        configured: [...configured],
        leftOut: [...leftOut],
        orders: {
          profile: [...orders.profile],
          follows: [...orders.follows],
          liked: [...orders.liked],
        },
      },
    };
  }
}
