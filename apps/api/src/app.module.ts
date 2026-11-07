import { Module, type DynamicModule } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module.ts';
import { AdminModule } from './admin/admin.module.ts';
import { AuthModule } from './auth/auth.module.ts';
import type { Api } from './core/compose.ts';
import { CoreModule } from './core/core.module.ts';
import { HealthModule } from './health/health.module.ts';
import { MeModule } from './me/me.module.ts';

@Module({})
export class AppModule {
  static with(api: Api): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.with(api),
        AuthModule,
        HealthModule,
        MeModule,
        AccountsModule,
        AdminModule,
      ],
    };
  }
}
