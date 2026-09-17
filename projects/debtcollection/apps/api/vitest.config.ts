import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/**/*.test.ts', 'src/__tests__/**'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
  resolve: {
    alias: {
      '@dcp/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@dcp/domain': path.resolve(__dirname, '../../packages/domain/src/index.ts'),
      '@dcp/dataverse-client': path.resolve(
        __dirname,
        '../../packages/dataverse-client/src/index.ts',
      ),
      '@dcp/auth-adapters': path.resolve(
        __dirname,
        '../../packages/auth-adapters/src/index.ts',
      ),
    },
  },
});
