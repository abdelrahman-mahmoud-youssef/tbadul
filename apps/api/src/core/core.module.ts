import { Module, type DynamicModule } from '@nestjs/common';
import type { Api } from './compose.ts';
import { API } from './tokens.ts';

@Module({})
export class CoreModule {
  static with(api: Api): DynamicModule {
    return {
      module: CoreModule,
      global: true,
      providers: [{ provide: API, useValue: api }],
      exports: [API],
    };
  }
}
