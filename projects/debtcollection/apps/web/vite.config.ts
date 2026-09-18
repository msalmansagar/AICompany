// vitest's defineConfig is vite's, widened to accept the test block — one config file, not two.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * The workspace is built to be served as a **Dynamics web resource**, not from a standalone host.
 *
 * That constraint decides nearly everything here:
 *
 *   • `base: './'` — a web resource is served from a path nobody controls
 *     (`/WebResources/qdb_…`), and an absolute `/assets/…` reference 404s there. This is the exact
 *     defect that cost the Form Engine an on-premises release: relative asset references are the only
 *     ones that survive.
 *   • **single file** — a web resource is one uploaded artefact. Inlining the JS and CSS removes the
 *     question of how sibling assets resolve entirely, which is worth more than the caching a split
 *     bundle would buy.
 *   • **no hashed filenames and no code splitting** — a dynamic import would have to fetch a sibling
 *     by URL at runtime, and that is the thing we just removed.
 *
 * Local `vite dev` still works for fast iteration; it simply is not how the artefact ships.
 */
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Everything inline: a web resource is a single uploaded file.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'workspace.js',
        assetFileNames: 'workspace.[ext]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
});
