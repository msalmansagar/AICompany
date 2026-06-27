import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Redirect the reused renderer's data-layer + auth imports to the in-CRM Xrm adapters and
// stubs, so the same renderer code runs against Xrm.WebApi with no axios/MSAL in the bundle.
function inCrmModuleSwap() {
  const xrmModules = ['formApi', 'lookupApi', 'optionsApi', 'filesApi', 'languageApi'];
  return {
    name: 'in-crm-module-swap',
    enforce: 'pre' as const,
    resolveId(source: string) {
      const api = source.match(/(?:^|[\\/])api[\\/](formApi|lookupApi|optionsApi|filesApi|languageApi|apiClient)(?:\.ts)?$/);
      if (api) {
        if (api[1] === 'apiClient') return path.resolve(dirname, 'webresource/stubs/apiClient.ts');
        if (xrmModules.includes(api[1])) return path.resolve(dirname, `webresource/xrm/${api[1]}.ts`);
      }
      if (/(?:^|[\\/])auth[\\/]tokenService(?:\.ts)?$/.test(source)) {
        return path.resolve(dirname, 'webresource/stubs/tokenService.ts');
      }
      if (/(?:^|[\\/])auth[\\/]msalConfig(?:\.ts)?$/.test(source)) {
        return path.resolve(dirname, 'webresource/stubs/msalConfig.ts');
      }
      // The portal DynamicIcon dynamically imports the whole @fluentui/react-icons set
      // (~15 MB); swap it for a curated-icon version so the single-file bundle stays small.
      if (/[\\/]DynamicIcon(?:\.tsx?)?$/.test(source)) {
        return path.resolve(dirname, 'webresource/swap/DynamicIcon.tsx');
      }
      return null;
    },
  };
}

export default defineConfig({
  root: path.resolve(dirname, 'webresource'),
  plugins: [react(), inCrmModuleSwap(), viteSingleFile()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      '@qdb/shared': path.resolve(dirname, '../shared/src/server.ts'),
    },
  },
  build: {
    outDir: path.resolve(dirname, 'dist-webresource'),
    emptyOutDir: true,
    target: 'es2019',
    chunkSizeWarningLimit: 8000,
  },
});
