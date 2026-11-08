import { loadEnv, type Plugin, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
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

/**
 * Fails a production build if dev-only overrides leaked in via `.env.local`.
 * `.env.local` is loaded by Vite in EVERY mode (including build), so REST/localhost config
 * placed there gets baked into the deployed (in-CRM) designer — putting it in REST mode
 * against a local proxy. Dev-only overrides must live in `.env.development.local` instead.
 */
function guardProductionEnvPlugin(): Plugin {
  return {
    name: 'guard-production-env',
    apply: 'build',
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      if (env.VITE_USE_REST_API === 'true') {
        throw new Error(
          'Refusing to build: VITE_USE_REST_API=true is set for a production build (likely ' +
          'from .env.local). Move dev-only overrides to .env.development.local so they do not ' +
          'leak into the deployed in-CRM designer, then rebuild.',
        );
      }
    },
  };
}

/**
 * ADR-004 (DFE-ENH-001 ENT-008): axe-core is licensed MPL-2.0 (file-level copyleft).
 * Its use is accepted for dev/test only. Listing these packages as external guarantees
 * they are never bundled into the CRM web resource shipped artifact, so the MPL-2.0
 * copyleft obligation never applies to the production build.
 */
const DEV_ONLY_EXTERNALS = ['axe-core', '@axe-core/playwright', 'vitest-axe', '@playwright/test'];

/** Vite build output root. packageSolution.js reads the emitted files from here. */
const DESIGNER_OUT_DIR = 'deploy/webresources/qdb_/form-designer';

/** Everything the chunked and single-file builds have in common. */
function createSharedConfig(): UserConfig {
  return {
    plugins: [react(), noCacheMetaPlugin(), guardProductionEnvPlugin()],
    // Relative base so asset paths in index.html are ./assets/... not /assets/...
    // Required for CRM web resources: served under /WebResources/qdb_/form-designer/
    // and absolute paths would resolve to the org root instead.
    base: './',
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        // DFE-STYLE-001 blank-page fix: resolve @qdb/shared to the server barrel at RUNTIME,
        // matching the package "types" field and the frontend portal. The package "main" is
        // src/index.ts (the mobile barrel), which lacks server-only value exports such as
        // calculateContrastRatio — importing those at runtime otherwise throws a module-graph
        // SyntaxError and blanks the whole designer.
        '@qdb/shared': resolve(__dirname, '../shared/src/server.ts'),
      },
    },
    optimizeDeps: {
      // exceljs is only reached through a dynamic import in the Translations dialog, so the dev
      // server does not see it at startup. Discovering it on that first click triggers a
      // re-optimise and a full page reload, which throws away the in-flight promise and leaves
      // the dialog spinning forever. Pre-bundling it up front costs a moment at boot instead.
      include: ['exceljs'],
    },
    build: {
      outDir: DESIGNER_OUT_DIR,
      emptyOutDir: true,
      // Target ES2020 — Edge Chromium 100+ and Chrome 100+ both support this.
      target: 'es2020',
      rollupOptions: {
        external: DEV_ONLY_EXTERNALS,
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      // axe-core scans are CPU-intensive in jsdom — allow up to 30s per test.
      // ENT-008 a11y tests routinely exceed the default 5s; keep this above the
      // measured ~6.5s baseline so CI doesn't flap under moderate system load.
      testTimeout: 30_000,
      // Exclude Playwright E2E specs — they use @playwright/test not vitest
      exclude: ['tests/e2e/**', '**/node_modules/**'],
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
  } as UserConfig;
}

/**
 * The default build: vendor chunks loaded as separate web resources, with content-hashed
 * filenames. Used wherever the designer is served from its own web resource folder path,
 * so a relative `./assets/...` reference resolves correctly.
 *
 * Dynamics serves web resources from a cache keyed on the file's path, and that
 * cache proved impossible to invalidate: with the record holding the new bytes and
 * componentstate published, the org kept serving an older copy that matched no
 * record at all. Neither PublishAllXml, a PublishXml naming the web resources
 * directly, nor Publish all customizations from the maker portal moved it, and it
 * survived overnight — so this is not propagation lag. A hashed name sidesteps the
 * question entirely: changed content means a path the cache has never seen.
 *
 * This does not desynchronise the solution manifest. packageSolution.js walks the
 * real build output and generates customizations.xml and the RootComponents from
 * it, deriving each WebResourceId deterministically from the file's logical name,
 * so a rebuilt bundle re-imports cleanly. Superseded assets are left behind in the
 * org as orphans and want an occasional sweep.
 */
export function createChunkedConfig(): UserConfig {
  const shared = createSharedConfig();

  return {
    ...shared,
    build: {
      ...shared.build,
      rollupOptions: {
        external: DEV_ONLY_EXTERNALS,
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-fluent': ['@fluentui/react-components'],
            'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
            'vendor-state': ['zustand', 'immer'],
          },
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
      // Warn at 500KB per chunk; CI fails total bundle check via checkBundleSize.js
      chunkSizeWarningLimit: 500,
    },
  } as UserConfig;
}

/**
 * The on-premises build: one self-contained index.html with every script and stylesheet
 * inlined, matching the pattern already proven by the in-CRM runtime (qdb_form_runtime.html).
 *
 * WHY on-prem needs this. The designer is opened through
 * `main.aspx?pagetype=webresource&webresourceName=qdb_%2Fform-designer%2Findex.html`,
 * which is the only URL that exposes `parent.Xrm`. On that URL the document base is
 * main.aspx, not the web resource folder, so the chunked build's relative
 * `./assets/index-<hash>.js` references resolve against the org root instead and every
 * one of them 404s — the HTML shell loads, the app never boots, and the designer presents
 * as a blank page. Inlining removes every external reference, so there is no base to
 * resolve and no second request to lose. It also removes the whole class of partial-import
 * failures, since the solution then carries one web resource instead of ten.
 *
 * The cost is chunk caching: the bundle is re-fetched whole on every publish. That is
 * acceptable here because CRM already keys its web resource cache on a path token that
 * changes on every "Publish All Customizations", so the vendor chunks were rarely reused
 * across publishes anyway.
 *
 * vite-plugin-singlefile sets `inlineDynamicImports`, which Rollup refuses to combine with
 * `manualChunks` — hence a separate factory rather than a flag on the chunked build.
 */
export function createSingleFileConfig(): UserConfig {
  const shared = createSharedConfig();

  return {
    ...shared,
    plugins: [...(shared.plugins ?? []), viteSingleFile()],
  } as UserConfig;
}

export default createChunkedConfig();
