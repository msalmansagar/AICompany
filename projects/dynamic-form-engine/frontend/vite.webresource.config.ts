import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Module ids must be POSIX-separated. path.resolve yields backslashes on Windows, which
// Rollup treats as a different id from the same file reached through a relative import —
// the module is then bundled twice, each copy with its own module state. That silently
// broke the in-CRM grid: the renderer filled formApi's loadedForm in one copy while
// gridDataService read the other (never assigned, so minified down to `return null`).
const swapTarget = (relativePath: string) => path.resolve(dirname, relativePath).replace(/\\/g, '/');

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
        if (api[1] === 'apiClient') return swapTarget('webresource/stubs/apiClient.ts');
        if (xrmModules.includes(api[1])) return swapTarget(`webresource/xrm/${api[1]}.ts`);
      }
      if (/[\\/]services[\\/]gridDataService(?:\.ts)?$/.test(source)) {
        return swapTarget('webresource/xrm/gridDataService.ts');
      }
      if (/(?:^|[\\/])auth[\\/]tokenService(?:\.ts)?$/.test(source)) {
        return swapTarget('webresource/stubs/tokenService.ts');
      }
      if (/(?:^|[\\/])auth[\\/]msalConfig(?:\.ts)?$/.test(source)) {
        return swapTarget('webresource/stubs/msalConfig.ts');
      }
      // The portal DynamicIcon dynamically imports the whole @fluentui/react-icons set
      // (~15 MB); swap it for a curated-icon version so the single-file bundle stays small.
      if (/[\\/]DynamicIcon(?:\.tsx?)?$/.test(source)) {
        return swapTarget('webresource/swap/DynamicIcon.tsx');
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
