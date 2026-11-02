import { accountId } from '../domain/account-id.ts';
import { parseBioToken, type BioToken } from '../domain/bio-token.ts';
import type { Check } from '../domain/check.ts';
import { parseContentId, type ContentId } from '../domain/content-id.ts';
import type { ListEvidence, ProfileEvidence } from '../domain/evidence.ts';
import { parseHandle, type Handle } from '../domain/handle.ts';
import type { CallContext } from '../ports/verification-source.ts';

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error(`fixture does not parse: ${JSON.stringify(result.error)}`);
  return result.value;
};

export const handle = (value: string): Handle => unwrap(parseHandle('tiktok', value));

export const content = (value: string): ContentId => unwrap(parseContentId('tiktok', value));

export const token = (value: string): BioToken => unwrap(parseBioToken(value));

export const performer = handle('performer');
export const target = handle('target');
export const video = content('7000000000000000000');

export const followsCheck: Check = { kind: 'follows', performer, target };
export const likedCheck: Check = { kind: 'liked', performer, content: video };
export const profileCheck: Check = { kind: 'profile', subject: performer };

export const listEvidence: ListEvidence = { pagesRead: 1, listExhausted: true };

export const profileEvidence = (bio: string): ProfileEvidence => ({
  accountId: accountId('tiktok', 'MS4wLjABAAAA'),
  bio,
  isPrivate: false,
});

export const context = (overrides: Partial<CallContext> = {}): CallContext => ({
  signal: new AbortController().signal,
  pageCap: 3,
  ...overrides,
});
