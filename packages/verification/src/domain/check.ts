import type { AccountId } from './account-id.ts';
import type { ContentId } from './content-id.ts';
import type { Handle } from './handle.ts';
import type { Platform } from './platform.ts';

export const checkKinds = ['profile', 'follows', 'liked'] as const;

export type CheckKind = (typeof checkKinds)[number];

export type Check =
  | {
      readonly kind: 'profile';
      readonly subject: Handle;
      readonly subjectId?: AccountId;
      readonly latestPost?: true;
    }
  | {
      readonly kind: 'follows';
      readonly performer: Handle;
      readonly performerId?: AccountId;
      readonly performerFollowingCount?: number;
      readonly target: Handle;
      readonly targetId: AccountId;
    }
  | {
      readonly kind: 'liked';
      readonly performer: Handle;
      readonly performerId?: AccountId;
      readonly content: ContentId;
    };

export type CheckOf<K extends CheckKind> = Extract<Check, { kind: K }>;

export const checkPlatform = (check: Check): Platform =>
  check.kind === 'profile' ? check.subject.platform : check.performer.platform;
