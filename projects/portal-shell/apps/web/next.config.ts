import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: ['@portal/ui', '@portal/widget-registry', '@portal/types', '@portal/i18n'],
  experimental: {
    typedRoutes: false,
  },
  // No `images.remotePatterns`: nothing imports next/image, so configuring
  // remote hosts only exposes the /_next/image proxy to no purpose. Restore a
  // narrowly-scoped pattern if and when a component actually uses next/image.
  env: {
    API_URL: process.env['API_URL'] ?? 'http://localhost:4001',
  },
};

export default withNextIntl(nextConfig);
