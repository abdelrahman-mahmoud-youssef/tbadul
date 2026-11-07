import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClaimsController } from './claims.controller.ts';
import type { Api } from './compose.ts';
import { AdminController } from './admin.controller.ts';
import { HealthController } from './health.controller.ts';
import { MeController } from './me.controller.ts';
import { AdminGuard, SessionGuard } from './session.ts';
import { API } from './tokens.ts';

@Module({})
export class AppModule {
  static with(api: Api): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, MeController, ClaimsController, AdminController],
      providers: [
        { provide: API, useValue: api },
        { provide: APP_GUARD, useClass: SessionGuard },
        AdminGuard,
      ],
    };
  }
}
