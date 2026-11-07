import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { Api } from './compose.ts';
import { HealthController } from './health.controller.ts';
import { MeController } from './me.controller.ts';
import { SessionGuard } from './session.ts';
import { API } from './tokens.ts';

@Module({})
export class AppModule {
  static with(api: Api): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, MeController],
      providers: [
        { provide: API, useValue: api },
        { provide: APP_GUARD, useClass: SessionGuard },
      ],
    };
  }
}
