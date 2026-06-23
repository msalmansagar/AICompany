import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: ['@portal/ui', '@portal/widget-registry', '@portal/types', '@portal/i18n'],
  experimental: {
    typedRoutes: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.blob.core.windows.net' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  env: {
    API_URL: process.env['API_URL'] ?? 'http://localhost:4001',
  },
};

export default withNextIntl(nextConfig);
