import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

// Web-resource virtual folder these files deploy under (must start with the publisher prefix).
const WR_BASE = '/WebResources/qdb_edp_designer/';

// --- Dataverse dev proxy -------------------------------------------------------
// Local-only: injects a service-principal bearer token and forwards /dataverse/*
// to the org's Web API. Keeps the browser same-origin (no CORS) and never exposes
// the secret to the client. Credentials are read from a local .env (override the path
// with EDP_ENV_PATH). Absent on CI/build — the proxy is dev-only and degrades gracefully.
const ENV_PATH = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(path)) return out; // no .env (e.g. CI build) — dev proxy simply won't authenticate
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function dataverseProxy(): Plugin {
  const env = loadEnv(ENV_PATH);
  const org = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
  let token = '';
  let expiresAt = 0;

  async function getToken(): Promise<string> {
    if (token && Date.now() < expiresAt - 60_000) return token;
    const form = new URLSearchParams({
      client_id: env.AZURE_CLIENT_ID,
      client_secret: env.AZURE_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: `${org}/.default`,
    });
    const res = await fetch(`https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!res.ok) throw new Error(`token ${res.status}`);
    const json: any = await res.json();
    token = json.access_token;
    expiresAt = Date.now() + json.expires_in * 1000;
    return token;
  }

  return {
    name: 'dataverse-proxy',
    apply: 'serve', // dev server only — never part of a production/CI build
    configureServer(server) {
      server.middlewares.use('/dataverse', async (req, res) => {
        try {
          const t = await getToken();
          const target = `${org}/api/data/v9.2${req.url}`;
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;

          const upstream = await fetch(target, {
            method: req.method,
            headers: {
              Authorization: `Bearer ${t}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'OData-Version': '4.0',
              'OData-MaxVersion': '4.0',
              Prefer: 'return=representation',
            },
            body,
          });
          const text = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(text);
        } catch (e: any) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: { message: e.message } }));
        }
      });
    },
  };
}

// CRM web-resource hardening: strip `crossorigin` (same-origin web resources; the
// attribute forces a CORS fetch that can fail in the CRM-hosted iframe) and inject a
// visible on-page error overlay so failures are readable without the console.
function crmWebResourcePlugin(): Plugin {
  return {
    name: 'crm-webresource',
    apply: 'build',
    transformIndexHtml(html) {
      html = html.replace(/\s+crossorigin/g, '');
      // Force the HTML shell to always re-fetch (hashed assets can cache forever, but the
      // shell must not, or a redeploy is masked by a stale cached index.html in CRM).
      const noCache = [
        '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />',
        '<meta http-equiv="Pragma" content="no-cache" />',
        '<meta http-equiv="Expires" content="0" />',
      ].join('');
      html = html.replace('</title>', '</title>' + noCache);
      const overlay = [
        '<script>(function(){',
        "function show(m){var r=document.getElementById('root')||document.body;",
        "var d=document.createElement('pre');d.style.cssText='white-space:pre-wrap;color:#b00020;background:#fff;font:12px/1.5 monospace;padding:12px;margin:0;border-bottom:1px solid #eee';",
        "d.textContent='[EDP designer] '+m;r.appendChild(d);}",
        "window.addEventListener('error',function(e){show((e.message||e.type)+'  @ '+((e.filename||'').split('/').pop())+':'+(e.lineno||''));});",
        "window.addEventListener('unhandledrejection',function(e){show('promise rejection: '+((e.reason&&(e.reason.stack||e.reason.message||e.reason))||e.reason));});",
        "setTimeout(function(){var r=document.getElementById('root');if(r&&!r.childElementCount)show('App did not mount within 6s. Scripts may have failed to load (path/CSP) or a module threw. See errors above, or F12 console.');},6000);",
        '})();</script>',
      ].join('');
      return html.replace('<body>', '<body>' + overlay);
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), dataverseProxy(), crmWebResourcePlugin()],
  // RELATIVE base for CRM: web resources are served under an org customization-version
  // token path (e.g. /BPM/{token}/webresources/...), so absolute /WebResources/... 404s.
  // './' makes assets resolve relative to the HTML's actual served location. (dev = root)
  base: command === 'build' ? './' : '/',
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        // Split large vendors so no single web-resource file exceeds the ~5 MB limit.
        manualChunks(id) {
          // Split only the large, self-contained vendors. Keep react/react-dom inside
          // `vendor` to avoid a circular chunk (react-dom <-> vendor) that leaves React
          // undefined at init and blanks the page.
          if (id.includes('monaco')) return 'monaco';
          if (id.includes('@codemirror') || id.includes('@lezer') || id.includes('codemirror')) return 'codemirror';
          if (id.includes('@gorules')) return 'gorules';
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5174,
    // Forward /runtime/* to the local C# runtime harness so the designer's Test
    // button executes rules through the REAL engine (same-origin, no CORS).
    proxy: {
      '/runtime': { target: 'http://localhost:5099', changeOrigin: true, rewrite: (p) => p.replace(/^\/runtime/, '') },
    },
  },
}));
