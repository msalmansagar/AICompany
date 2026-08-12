import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Builds the editor as ONE self-contained HTML file.
 *
 * A Dataverse web resource is a single file, and §1's CSP constraints forbid
 * dynamic imports and external loads at runtime — so CSS and JS are inlined and
 * nothing is code-split. The output is deployed as `msst_cms_editor.html`.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../webresources',
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
