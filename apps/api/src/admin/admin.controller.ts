import {
  addPoolAccountRequest,
  addPoolAccountResponse,
  fallbacksResponse,
  poolAccountIdParam,
  poolAccountResponse,
  poolResponse,
  setPoolAccountActiveRequest,
  type AddPoolAccountRequest,
  type AddPoolAccountResponse,
  type FallbacksResponse,
  type PoolAccountResponse,
  type PooledAccount as PooledAccountBody,
  type PoolResponse,
  type SetPoolAccountActiveRequest,
} from '@engagement-exchange/contracts';
import type {
  AddVerificationAccountError,
  PooledAccount,
  VerificationAccounts,
} from '@engagement-exchange/social-accounts';
import { platforms, type FallbackCounter } from '@engagement-exchange/verification';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/session.ts';
import type { Api } from '../core/compose.ts';
import { API } from '../core/tokens.ts';
import { ApiError } from '../http/errors.ts';

const presentPooledAccount = (account: PooledAccount): PooledAccountBody => ({
  accountId: account.accountId.value,
  ...(account.handle !== undefined && { handle: account.handle.value }),
  active: account.active,
  assignedCount: account.assignedCount,
});

const additionFailure = (error: AddVerificationAccountError): ApiError => {
  if (error.kind === 'invalid_handle') {
    return new ApiError({ code: 'invalid_handle', details: { reason: error.reason } });
  }
  switch (error.outcome) {
    case 'private':
    case 'not_found':
      return new ApiError({ code: 'account_unavailable', details: { outcome: error.outcome } });
    case 'not_following':
    case 'source_error':
      return new ApiError({ code: 'source_unavailable' });
  }
};

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  private readonly accounts: VerificationAccounts;
  private readonly fallbacks: FallbackCounter;

  constructor(@Inject(API) api: Api) {
    this.accounts = api.verificationAccounts;
    this.fallbacks = api.fallbacks;
  }

  @Get('pool')
  @SerializeOptions({ schema: poolResponse })
  async pool(): Promise<PoolResponse> {
    return {
      pools: await Promise.all(
        platforms.map(async (name) => ({
          platform: name,
          accounts: (await this.accounts.listVerificationAccounts({ platform: name })).map(
            presentPooledAccount,
          ),
        })),
      ),
    };
  }

  @Post('pool')
  @SerializeOptions({ schema: addPoolAccountResponse })
  async add(
    @Body({ schema: addPoolAccountRequest }) body: AddPoolAccountRequest,
  ): Promise<AddPoolAccountResponse> {
    const added = await this.accounts.addVerificationAccount(body);
    if (!added.ok) throw additionFailure(added.error);
    const { account, status } = added.value;
    return {
      account: { accountId: account.accountId.value, handle: account.handle.value },
      status,
    };
  }

  @Patch('pool/:accountId')
  @SerializeOptions({ schema: poolAccountResponse })
  async setActive(
    @Param('accountId', { schema: poolAccountIdParam }) accountId: string,
    @Body({ schema: setPoolAccountActiveRequest }) body: SetPoolAccountActiveRequest,
  ): Promise<PoolAccountResponse> {
    const updated = await this.accounts.setVerificationAccountActive({ accountId, ...body });
    if (!updated.ok) throw new ApiError({ code: 'not_found' });
    return { account: presentPooledAccount(updated.value) };
  }

  @Get('fallbacks')
  @SerializeOptions({ schema: fallbacksResponse })
  fallbackCounts(): FallbacksResponse {
    return { counts: [...this.fallbacks.counts()] };
  }
}
