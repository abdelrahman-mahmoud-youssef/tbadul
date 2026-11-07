import { failed } from '../domain/answer.ts';
import { checkKinds, type CheckKind } from '../domain/check.ts';
import type { Platform } from '../domain/platform.ts';
import type { SourceName } from '../domain/source-name.ts';
import type {
  CallContext,
  SourceAnswer,
  SourceCheckOf,
  VerificationSource,
} from '../ports/verification-source.ts';

export type CheckHandler<K extends CheckKind> = (
  check: SourceCheckOf<K>,
  context: CallContext,
) => Promise<SourceAnswer<K>>;

export type CheckHandlers = { readonly [K in CheckKind]?: CheckHandler<K> };

export interface SourceIdentity {
  readonly name: SourceName;
  readonly platform: Platform;
}

export const defineSource = (
  identity: SourceIdentity,
  handlers: CheckHandlers,
): VerificationSource => ({
  name: identity.name,
  platform: identity.platform,
  supports: new Set(checkKinds.filter((kind) => handlers[kind] !== undefined)),
  answer: <K extends CheckKind>(
    check: SourceCheckOf<K>,
    context: CallContext,
  ): Promise<SourceAnswer<K>> => {
    const handler = handlers[check.kind];
    return handler === undefined
      ? Promise.resolve(
          failed({
            kind: 'unexpected',
            message: `${identity.name} does not support ${check.kind}`,
          }),
        )
      : handler(check, context);
  },
});
