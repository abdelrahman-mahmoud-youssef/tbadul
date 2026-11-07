import { meResponse, type MeResponse } from '@engagement-exchange/contracts';
import { Controller, Get, SerializeOptions } from '@nestjs/common';
import { Caller, type Principal } from '../auth/session.ts';

@Controller('me')
export class MeController {
  @Get()
  @SerializeOptions({ schema: meResponse })
  me(@Caller() caller: Principal): MeResponse {
    return {
      user: { id: caller.userId, email: caller.email, name: caller.name, role: caller.role },
    };
  }
}
