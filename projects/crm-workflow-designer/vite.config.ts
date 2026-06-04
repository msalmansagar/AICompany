import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';

const ORG_URL = 'https://org5869857f.crm4.dynamics.com';
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';

let devToken = '';
let tokenExpiry = 0; // ms timestamp — 0 means never acquired

async function acquireToken(secret: string): Promise<void> {
  if (!secret) {
    console.warn('\n[dev-auth] AZURE_CLIENT_SECRET not set — proxy unauthenticated\n');
    return;
  }
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: CLIENT_ID,
          client_secret: secret,
          scope: `${ORG_URL}/.default`,
        }).toString(),
      }
    );
    if (!res.ok) {
      console.error(`[dev-auth] Token request failed: HTTP ${res.status}`);
      return;
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    devToken = data.access_token;
    tokenExpiry = Date.now() + data.expires_in * 1000;
    console.log(`\n[dev-auth] Token acquired ✓  (valid for ${data.expires_in}s)\n`);
  } catch (err) {
    console.error('[dev-auth] Token acquisition error:', err);
  }
}

function isTokenExpired(): boolean {
  // Refresh 60 s before actual expiry to avoid races.
  return Date.now() >= tokenExpiry - 60_000;
}

function dataverseAuthPlugin(secret: string): Plugin {
  return {
    name: 'dataverse-auth',
    async configureServer(server) {
      // Acquire on startup.
      await acquireToken(secret);

      // Re-check on every /api request so a long-running dev server
      // never hits Dataverse with an expired token.
      server.middlewares.use('/api', async (_req, _res, next) => {
        if (isTokenExpired()) {
          await acquireToken(secret);
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // loadEnv with prefix '' loads ALL vars (not just VITE_*) from .env.local etc.
  const env = loadEnv(mode, process.cwd(), '');
  const secret = env['AZURE_CLIENT_SECRET'] ?? '';

  return {
    plugins: [react(), viteSingleFile(), dataverseAuthPlugin(secret)],

    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: ORG_URL,
          changeOrigin: true,
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (devToken) {
                proxyReq.setHeader('Authorization', `Bearer ${devToken}`);
              }
            });
            proxy.on('error', (err) => {
              console.error('[dev-proxy]', err.message);
            });
          },
        },
      },
    },

    resolve: { alias: { '@': path.resolve(__dirname, './src') } },

    build: {
      outDir: 'dist',
      target: 'es2020',
      assetsInlineLimit: 100_000_000,
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  };
});
