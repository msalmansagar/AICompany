import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@portal/ui',
    '@portal/widget-registry',
    '@portal/types',
    '@portal/i18n',
    '@fluentui/react-components',
    '@fluentui/react-icons',
    '@fluentui/react-utilities',
    '@fluentui/react-context-selector',
    '@griffel/react',
  ],
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
