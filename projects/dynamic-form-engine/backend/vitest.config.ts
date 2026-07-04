import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@qdb/shared': path.resolve(__dirname, '../shared/src/server.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATAVERSE_URL: 'https://test.crm.dynamics.com',
      AZURE_TENANT_ID: 'test-tenant-id',
      AZURE_CLIENT_ID: 'test-client-id',
      AZURE_CLIENT_SECRET: 'test-client-secret',
      AZURE_AD_AUDIENCE: 'test-audience',
      MOCK_CRM: 'true',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80, functions: 80, branches: 70 },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
