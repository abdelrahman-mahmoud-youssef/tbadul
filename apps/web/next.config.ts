import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { env } from './env';

const withNextIntl = createNextIntlPlugin();

const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  rewrites: () =>
    Promise.resolve([{ source: '/api/:path*', destination: `${env.API_ORIGIN}/api/:path*` }]),
};

export default withNextIntl(config);
