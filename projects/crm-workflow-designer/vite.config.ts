import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';

let devToken = '';
let tokenExpiry = 0; // ms timestamp — 0 means never acquired

async function acquireToken(orgUrl: string, tenantId: string, clientId: string, secret: string): Promise<void> {
  if (!secret) {
    console.warn('\n[dev-auth] AZURE_CLIENT_SECRET not set — proxy unauthenticated\n');
    return;
  }
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: secret,
          scope: `${orgUrl}/.default`,
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

function dataverseAuthPlugin(orgUrl: string, tenantId: string, clientId: string, secret: string): Plugin {
  return {
    name: 'dataverse-auth',
    async configureServer(server) {
      // Acquire on startup.
      await acquireToken(orgUrl, tenantId, clientId, secret);

      // Re-check on every /api request so a long-running dev server
      // never hits Dataverse with an expired token.
      server.middlewares.use('/api', async (_req, _res, next) => {
        if (isTokenExpired()) {
          await acquireToken(orgUrl, tenantId, clientId, secret);
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // loadEnv with prefix '' loads ALL vars (not just VITE_*) from .env.local etc.
  const env = loadEnv(mode, process.cwd(), '');

  const orgUrl  = env['CRM_ORG_URL']      ?? '';
  const tenantId = env['AZURE_TENANT_ID'] ?? '';
  const clientId = env['AZURE_CLIENT_ID'] ?? '';
  const secret   = env['AZURE_CLIENT_SECRET'] ?? '';

  if (!orgUrl || !tenantId || !clientId) {
    throw new Error(
      '[vite.config] Missing required env vars. Set in .env.local:\n' +
      '  CRM_ORG_URL, AZURE_TENANT_ID, AZURE_CLIENT_ID'
    );
  }

  return {
    plugins: [react(), viteSingleFile(), dataverseAuthPlugin(orgUrl, tenantId, clientId, secret)],

    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: orgUrl,
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
