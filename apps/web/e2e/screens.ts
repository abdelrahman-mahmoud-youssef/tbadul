import messages from '../messages/ar.json' with { type: 'json' };
import type { Role } from './session';

export interface Screen {
  readonly name: string;
  readonly path: string;
  readonly heading: string;
  readonly as?: Role;
  readonly status?: 404;
}

export const screens: readonly Screen[] = [
  { name: 'landing', path: '/', heading: messages.landing.headline },
  { name: 'sign-in', path: '/sign-in', heading: messages.signIn.title },
  { name: 'sign-up', path: '/sign-up', heading: messages.signUp.title },
  { name: 'not-found', path: '/no-such-page', heading: messages.notFound.title, status: 404 },
  { name: 'accounts', path: '/accounts', heading: messages.accounts.title, as: 'user' },
  { name: 'admin', path: '/admin', heading: messages.admin.title, as: 'admin' },
];
