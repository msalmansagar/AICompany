import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Injects no-cache meta tags into index.html so the HTML shell is always re-fetched.
 *
 * Asset URLs are deliberately left WITHOUT a ?v= query string. CRM serves every web
 * resource under an org customization-version token in the path
 * (e.g. /BPM/{639182300580000008}/webresources/...), which already changes on every
 * "Publish All Customizations" and busts the browser cache for all assets. A ?v= query
 * is therefore redundant on cloud and, critically, makes the on-premise web resource
 * handler return HTTP 500 — query strings are not allowed on on-prem web resource URLs.
 */
function noCacheMetaPlugin(): Plugin {
  const noCacheMeta = [
    '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />',
    '<meta http-equiv="Pragma" content="no-cache" />',
    '<meta http-equiv="Expires" content="0" />',
  ].join('\n    ');

  return {
    name: 'no-cache-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${noCacheMeta}`);
    },
  };
}

// Vite config for CRM web resource bundle output.
// Produces a self-contained bundle importable as a CRM web resource.
export default defineConfig({
  plugins: [react(), noCacheMetaPlugin()],
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
