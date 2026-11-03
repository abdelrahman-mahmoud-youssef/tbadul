import { accountId, type AccountId } from '../../domain/account-id.ts';
import { failed, type Answer } from '../../domain/answer.ts';
import type { Handle } from '../../domain/handle.ts';
import type { Cost, SourceError } from '../../domain/outcome.ts';
import type { Result } from '../../domain/result.ts';
import type { RequestSigner } from '../../ports/request-signer.ts';
import type { CallContext, VerificationSource } from '../../ports/verification-source.ts';
import { defineSource } from '../define-source.ts';
import {
  decodeJson,
  failureForStatus,
  type HttpClient,
  type HttpReply,
} from '../http/http-client.ts';
import { extractUserDetail, type UserDetail } from './profile-page.ts';
import { followingListSchema, likedListSchema } from './schemas.ts';

export interface ScraperDeps {
  readonly http: HttpClient;
  readonly signer: RequestSigner;
}

const web = 'https://www.tiktok.com';
const pageSize = 30;
const userNotFound = 10221;
const listHidden = 10222;

const webQuery = (params: Record<string, string>): string =>
  new URLSearchParams({
    aid: '1988',
    app_language: 'en',
    app_name: 'tiktok_web',
    browser_language: 'en-US',
    browser_name: 'Mozilla',
    browser_online: 'true',
    browser_platform: 'MacIntel',
    channel: 'tiktok_web',
    cookie_enabled: 'true',
    device_platform: 'web_pc',
    from_page: 'user',
    language: 'en',
    os: 'mac',
    region: 'US',
    screen_height: '1080',
    screen_width: '1920',
    tz_name: 'UTC',
    webcast_language: 'en',
    count: String(pageSize),
    ...params,
  }).toString();

const profileUrl = (handle: Handle): string => `${web}/@${handle.value}`;

const followingUrl = (secUid: string, cursor: string): string =>
  `${web}/api/user/list/?${webQuery({ secUid, minCursor: cursor, maxCursor: '0', scene: '21' })}`;

const likedUrl = (secUid: string, cursor: string): string =>
  `${web}/api/favorite/item_list/?${webQuery({ secUid, cursor, coverFormat: '2' })}`;

const requests = (amount: number): Cost => ({ unit: 'request', amount });

const unknownStatus = (providerStatus: number): SourceError => ({
  kind: 'unknown_status',
  message: `tiktok statusCode ${providerStatus}`,
  providerStatus,
});

const signedGet = async (
  deps: ScraperDeps,
  url: string,
  context: CallContext,
  useSignedUrl: boolean,
): Promise<Result<HttpReply, SourceError>> => {
  const signed = await deps.signer.sign(url, context.signal);
  if (!signed.ok) return signed;
  return deps.http.get(useSignedUrl ? signed.value.url : url, context.signal, signed.value.headers);
};

const profileAnswer = (detail: UserDetail, handle: Handle): Answer<'profile'> => {
  if (detail.statusCode === userNotFound) return { outcome: 'not_found', cost: requests(1) };
  if (detail.statusCode !== 0 || detail.userInfo === undefined) {
    return failed(unknownStatus(detail.statusCode), requests(1));
  }
  const { user } = detail.userInfo;
  return {
    outcome: 'verified',
    evidence: {
      accountId: accountId(handle.platform, user.secUid),
      bio: user.signature,
      isPrivate: user.privateAccount,
      ...(user.followingVisibility !== undefined && {
        followingVisible: user.followingVisibility === 1,
      }),
      ...(user.openFavorite !== undefined && { likesVisible: user.openFavorite }),
      ...(detail.userInfo.statsV2 && {
        followerCount: detail.userInfo.statsV2.followerCount,
        videoCount: detail.userInfo.statsV2.videoCount,
      }),
      ...(user.avatarThumb !== undefined && { avatarUrl: user.avatarThumb.split('?')[0] }),
      ...(user.createTime !== undefined && { createdAt: user.createTime * 1000 }),
    },
    cost: requests(1),
  };
};

const readProfile = async (
  deps: ScraperDeps,
  handle: Handle,
  context: CallContext,
): Promise<Answer<'profile'>> => {
  const reply = await signedGet(deps, profileUrl(handle), context, false);
  if (!reply.ok) return failed(reply.error, requests(1));
  if (reply.value.status === 404) return { outcome: 'not_found', cost: requests(1) };
  if (reply.value.status !== 200) return failed(failureForStatus(reply.value.status), requests(1));
  const detail = extractUserDetail(reply.value.text);
  return detail.ok ? profileAnswer(detail.value, handle) : failed(detail.error, requests(1));
};

interface Page<T> {
  readonly items: readonly T[];
  readonly next?: string;
}

type PageRead<T> = Result<Page<T>, SourceError> | { readonly hidden: true };

const scanList = async <T>(
  deps: ScraperDeps,
  context: CallContext,
  url: (cursor: string) => string,
  read: (reply: HttpReply) => PageRead<T>,
  matches: (item: T) => boolean,
  costBefore: number,
): Promise<Answer<'follows'>> => {
  let cursor = '0';
  for (let page = 1; page <= context.pageCap; page += 1) {
    const cost = requests(costBefore + page);
    const reply = await signedGet(deps, url(cursor), context, true);
    if (!reply.ok) return failed(reply.error, cost);
    if (reply.value.text === '') return failed({ kind: 'blocked', message: 'empty body' }, cost);
    const outcome = read(reply.value);
    if ('hidden' in outcome) return { outcome: 'private', cost };
    if (!outcome.ok) return failed(outcome.error, cost);
    if (outcome.value.items.some(matches)) {
      return { outcome: 'verified', evidence: { pagesRead: page, listExhausted: false }, cost };
    }
    if (outcome.value.next === undefined) {
      return { outcome: 'not_following', evidence: { pagesRead: page, listExhausted: true }, cost };
    }
    cursor = outcome.value.next;
  }
  return {
    outcome: 'not_following',
    evidence: { pagesRead: context.pageCap, listExhausted: false },
    cost: requests(costBefore + context.pageCap),
  };
};

const readFollowing = (reply: HttpReply): PageRead<{ user: { uniqueId: string } }> => {
  const decoded = decodeJson(reply, followingListSchema);
  if (!decoded.ok) return decoded;
  const { statusCode, userList, hasMore, minCursor } = decoded.value;
  if (statusCode === listHidden) return { hidden: true };
  if (statusCode !== 0) return { ok: false, error: unknownStatus(statusCode) };
  return {
    ok: true,
    value: {
      items: userList ?? [],
      ...(hasMore === true && minCursor !== undefined && { next: minCursor }),
    },
  };
};

const readLiked = (reply: HttpReply): PageRead<{ id: string }> => {
  const decoded = decodeJson(reply, likedListSchema);
  if (!decoded.ok) return decoded;
  const { statusCode, itemList, hasMore, cursor } = decoded.value;
  if (statusCode !== 0) return { ok: false, error: unknownStatus(statusCode) };
  if (itemList === undefined) return { hidden: true };
  return {
    ok: true,
    value: { items: itemList, ...(hasMore === true && cursor !== undefined && { next: cursor }) },
  };
};

const withPerformer = async <K extends 'follows' | 'liked'>(
  deps: ScraperDeps,
  check: { readonly performer: Handle; readonly performerId?: AccountId },
  context: CallContext,
  visible: (evidence: { followingVisible?: boolean; likesVisible?: boolean }) => boolean,
  scan: (secUid: string, costBefore: number) => Promise<Answer<K>>,
): Promise<Answer<K>> => {
  if (check.performerId !== undefined) return scan(check.performerId.value, 0);

  const profile = await readProfile(deps, check.performer, context);
  switch (profile.outcome) {
    case 'verified':
      if (!visible(profile.evidence)) return { outcome: 'private', cost: profile.cost };
      return scan(profile.evidence.accountId.value, profile.cost.amount);
    case 'not_following':
      return failed({ kind: 'unexpected', message: 'profile read answered not_following' });
    case 'private':
    case 'not_found':
      return { outcome: profile.outcome, cost: profile.cost };
    case 'source_error':
      return profile;
  }
};

export const scraperSource = (deps: ScraperDeps): VerificationSource =>
  defineSource(
    { name: 'scraper', platform: 'tiktok' },
    {
      profile: (check, context) => readProfile(deps, check.subject, context),
      follows: (check, context) =>
        withPerformer(
          deps,
          check,
          context,
          (evidence) => evidence.followingVisible !== false,
          (secUid, costBefore) =>
            scanList(
              deps,
              context,
              (cursor) => followingUrl(secUid, cursor),
              readFollowing,
              (entry) => entry.user.uniqueId.toLowerCase() === check.target.value,
              costBefore,
            ),
        ),
      liked: (check, context) =>
        withPerformer(
          deps,
          check,
          context,
          (evidence) => evidence.likesVisible !== false,
          (secUid, costBefore) =>
            scanList(
              deps,
              context,
              (cursor) => likedUrl(secUid, cursor),
              readLiked,
              (item) => item.id === check.content.value,
              costBefore,
            ),
        ),
    },
  );
