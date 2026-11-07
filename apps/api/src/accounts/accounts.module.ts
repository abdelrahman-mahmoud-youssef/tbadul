import { Module } from '@nestjs/common';
import { ClaimsController } from './claims.controller.ts';

@Module({ controllers: [ClaimsController] })
export class AccountsModule {}
