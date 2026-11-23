import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-request-path', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return intl(new NextRequest(request, { headers }));
}

export const config = {
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
