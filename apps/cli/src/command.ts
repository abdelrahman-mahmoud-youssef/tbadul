import { userRoles, type UserRole } from '@engagement-exchange/db';
import { claimId, type ClaimId } from '@engagement-exchange/social-accounts';
import { err, ok, parseHandle, type Handle, type Result } from '@engagement-exchange/verification';
import { z } from 'zod';
import { parseDemo, type Demo, type WatchFlags } from './commands/demo/demo.ts';

export type Command =
  | { readonly kind: 'demo'; readonly demo: Demo }
  | { readonly kind: 'link start'; readonly account: string }
  | { readonly kind: 'link verify'; readonly claim: ClaimId }
  | { readonly kind: 'user add'; readonly email: string; readonly name: string }
  | { readonly kind: 'user role'; readonly email: string; readonly role: UserRole }
  | { readonly kind: 'pool add'; readonly account: Handle }
  | { readonly kind: 'pool list' };

export type DatabaseCommand = Extract<
  Command,
  { kind: 'user add' | 'user role' | 'pool add' | 'pool list' }
>;

export interface CommandFlags extends WatchFlags {
  readonly name?: string | undefined;
}

export const invalidClaimId = 'invalid claim id: use the id printed by link start';

const email = z.email().toLowerCase();

const claim = z.uuid().transform(claimId);

const role = z.enum(userRoles);

export const needsDatabase = (command: Command): command is DatabaseCommand =>
  command.kind === 'user add' ||
  command.kind === 'user role' ||
  command.kind === 'pool add' ||
  command.kind === 'pool list';

export const parseCommand = (
  positionals: readonly string[],
  flags: CommandFlags = {},
): Result<Command, string> | undefined => {
  const demo = parseDemo(positionals, flags);
  if (demo !== undefined) return demo.ok ? ok({ kind: 'demo', demo: demo.value }) : demo;
  const [group, action, argument, ...rest] = positionals;
  const command = `${group ?? ''} ${action ?? ''}`;
  if (command === 'pool list' && argument === undefined) return ok({ kind: 'pool list' });
  if (command === 'user role') {
    const [named, ...extra] = rest;
    if (argument === undefined || named === undefined || extra.length > 0) return undefined;
    const parsedEmail = email.safeParse(argument);
    if (!parsedEmail.success) return err('invalid email');
    const parsedRole = role.safeParse(named);
    if (!parsedRole.success) return err(`invalid role: use ${userRoles.join(' or ')}`);
    return ok({ kind: 'user role', email: parsedEmail.data, role: parsedRole.data });
  }
  if (argument === undefined || rest.length > 0) return undefined;
  switch (command) {
    case 'link start':
      return ok({ kind: 'link start', account: argument });
    case 'link verify': {
      const parsed = claim.safeParse(argument);
      return parsed.success ? ok({ kind: 'link verify', claim: parsed.data }) : err(invalidClaimId);
    }
    case 'user add': {
      const parsed = email.safeParse(argument);
      return parsed.success
        ? ok({
            kind: 'user add',
            email: parsed.data,
            name: flags.name ?? parsed.data.slice(0, parsed.data.indexOf('@')),
          })
        : err('invalid email');
    }
    case 'pool add': {
      const parsed = parseHandle('tiktok', argument);
      return parsed.ok
        ? ok({ kind: 'pool add', account: parsed.value })
        : err(`invalid handle: ${argument}`);
    }
    default:
      return undefined;
  }
};
