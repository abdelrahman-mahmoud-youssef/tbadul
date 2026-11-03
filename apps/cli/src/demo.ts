import {
  err,
  ok,
  parseBioToken,
  parseContentId,
  parseHandle,
  type BioToken,
  type ContentId,
  type Handle,
  type Result,
} from '@engagement-exchange/verification';

export type Demo =
  | { readonly command: 'profile'; readonly subject: Handle }
  | { readonly command: 'owns'; readonly subject: Handle; readonly token: BioToken }
  | { readonly command: 'follows'; readonly performer: Handle; readonly target: Handle }
  | { readonly command: 'liked'; readonly performer: Handle; readonly content: ContentId };

const named =
  <T>(what: string, parse: (input: string) => Result<T, unknown>) =>
  (input: string): Result<T, string> => {
    const parsed = parse(input);
    return parsed.ok ? parsed : err(`invalid ${what}: ${input}`);
  };

const handle = named('handle', (input) => parseHandle('tiktok', input));
const content = named('content', (input) => parseContentId('tiktok', input));
const bioToken = named('bio token', parseBioToken);

const pair = <A, B>(
  first: Result<A, string>,
  second: Result<B, string>,
): Result<readonly [A, B], string> => {
  if (!first.ok) return first;
  if (!second.ok) return second;
  return ok([first.value, second.value]);
};

export const parseDemo = (positionals: readonly string[]): Result<Demo, string> | undefined => {
  const [command, first, second] = positionals;
  if (command === 'profile' && first !== undefined && positionals.length === 2) {
    const subject = handle(first);
    return subject.ok ? ok({ command, subject: subject.value }) : subject;
  }
  if (first === undefined || second === undefined || positionals.length !== 3) return undefined;
  if (command === 'owns') {
    const parsed = pair(handle(first), bioToken(second));
    return parsed.ok ? ok({ command, subject: parsed.value[0], token: parsed.value[1] }) : parsed;
  }
  if (command === 'follows') {
    const parsed = pair(handle(first), handle(second));
    return parsed.ok
      ? ok({ command, performer: parsed.value[0], target: parsed.value[1] })
      : parsed;
  }
  if (command === 'liked') {
    const parsed = pair(handle(first), content(second));
    return parsed.ok
      ? ok({ command, performer: parsed.value[0], content: parsed.value[1] })
      : parsed;
  }
  return undefined;
};
