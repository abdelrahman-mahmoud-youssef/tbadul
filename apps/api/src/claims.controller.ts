import {
  claimIdParam,
  claimResponse,
  linkedAccountsResponse,
  startClaimRequest,
  verifyClaimResponse,
  type ClaimResponse,
  type LinkedAccountsResponse,
  type StartClaimRequest,
  type VerifyClaimResponse,
} from '@engagement-exchange/contracts';
import { claimId, type SocialAccounts } from '@engagement-exchange/social-accounts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  SerializeOptions,
} from '@nestjs/common';
import type { Api } from './compose.ts';
import { ApiError, claimFailure, iso } from './errors.ts';
import { presentClaim, presentPlatformAccounts } from './present.ts';
import { Caller, type Principal } from './session.ts';
import { API } from './tokens.ts';

@Controller()
export class ClaimsController {
  private readonly social: SocialAccounts;

  constructor(@Inject(API) api: Api) {
    this.social = api.socialAccounts;
  }

  @Get('linked-accounts')
  @SerializeOptions({ schema: linkedAccountsResponse })
  async linkedAccounts(@Caller() caller: Principal): Promise<LinkedAccountsResponse> {
    const platforms = await this.social.listLinkedAccounts({ userId: caller.userId });
    return { platforms: platforms.map(presentPlatformAccounts) };
  }

  @Post('claims')
  @SerializeOptions({ schema: claimResponse })
  async start(
    @Caller() caller: Principal,
    @Body({ schema: startClaimRequest }) body: StartClaimRequest,
  ): Promise<ClaimResponse> {
    const started = await this.social.startAccountClaim({ userId: caller.userId, ...body });
    if (!started.ok) throw claimFailure(started.error);
    const claim = started.value;
    if (claim.state === 'eligibility_failed') {
      throw new ApiError({
        code: 'eligibility_failed',
        details: { claimId: claim.id, results: [...claim.eligibility.results] },
      });
    }
    if (claim.rejection === 'pool_exhausted') throw new ApiError({ code: 'pool_exhausted' });
    return { claim: presentClaim(claim) };
  }

  @Get('claims/:id')
  @SerializeOptions({ schema: claimResponse })
  async get(
    @Caller() caller: Principal,
    @Param('id', { schema: claimIdParam }) id: string,
  ): Promise<ClaimResponse> {
    const found = await this.social.getAccountClaim({
      userId: caller.userId,
      claimId: claimId(id),
    });
    if (!found.ok) throw claimFailure(found.error);
    return { claim: presentClaim(found.value) };
  }

  @Post('claims/:id/verify')
  @HttpCode(200)
  @SerializeOptions({ schema: verifyClaimResponse })
  async verify(
    @Caller() caller: Principal,
    @Param('id', { schema: claimIdParam }) id: string,
  ): Promise<VerifyClaimResponse> {
    const verified = await this.social.verifyAccountClaim({
      userId: caller.userId,
      claimId: claimId(id),
    });
    if (!verified.ok) throw claimFailure(verified.error);
    const { outcome, claim } = verified.value;
    if (outcome === 'source_error') throw new ApiError({ code: 'source_unavailable' });
    return { outcome, claim: presentClaim(claim), nextAllowedAt: iso(claim.nextVerifyAt) };
  }

  @Delete('claims/:id')
  @SerializeOptions({ schema: claimResponse })
  async cancel(
    @Caller() caller: Principal,
    @Param('id', { schema: claimIdParam }) id: string,
  ): Promise<ClaimResponse> {
    const cancelled = await this.social.cancelAccountClaim({
      userId: caller.userId,
      claimId: claimId(id),
    });
    if (!cancelled.ok) throw claimFailure(cancelled.error);
    return { claim: presentClaim(cancelled.value) };
  }
}
