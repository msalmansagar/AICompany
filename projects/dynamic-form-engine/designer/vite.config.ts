import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Appends ?v=BUILD_TIMESTAMP to every JS/CSS asset URL in the generated index.html.
 * Filenames remain stable (customizations.xml stays accurate), but browsers see a
 * new URL on every deploy and fetch fresh content instead of serving stale cache.
 */
function cacheBustPlugin(): Plugin {
  const buildVersion = Date.now().toString();
  const noCacheMeta = [
    '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />',
    '<meta http-equiv="Pragma" content="no-cache" />',
    '<meta http-equiv="Expires" content="0" />',
  ].join('\n    ');

  return {
    name: 'cache-bust-assets',
    apply: 'build',
    transformIndexHtml(html) {
      return html
        // Inject no-cache meta tags right after <head>
        .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${noCacheMeta}`)
        // Stamp new version on every asset URL
        .replace(/(src="\.\/assets\/[^"?]+\.js)(")/g, `$1?v=${buildVersion}$2`)
        .replace(/(href="\.\/assets\/[^"?]+\.js)(")/g, `$1?v=${buildVersion}$2`)
        .replace(/(href="\.\/assets\/[^"?]+\.css)(")/g, `$1?v=${buildVersion}$2`);
    },
  };
}

// Vite config for CRM web resource bundle output.
// Produces a self-contained bundle importable as a CRM web resource.
export default defineConfig({
  plugins: [react(), cacheBustPlugin()],
  // Relative base so asset paths in index.html are ./assets/... not /assets/...
  // Required for CRM web resources: served under /WebResources/qdb_/form-designer/
  // and absolute paths would resolve to the org root instead.
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'deploy/webresources/qdb_/form-designer',
    emptyOutDir: true,
    // Target ES2020 — Edge Chromium 100+ and Chrome 100+ both support this.
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-fluent': ['@fluentui/react-components'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'vendor-state': ['zustand', 'immer'],
        },
        // Stable filenames (no content hashes) so customizations.xml
        // stays accurate across rebuilds without manual updates.
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    // Warn at 500KB per chunk; CI fails total bundle check via checkBundleSize.js
    chunkSizeWarningLimit: 500,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
