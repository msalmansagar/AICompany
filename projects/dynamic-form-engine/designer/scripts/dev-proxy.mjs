/**
 * Designer dev proxy — forwards RestWebApiAdapter requests to Dataverse.
 *
 * Reads credentials from .env.proxy in the designer root.
 * Start with: node scripts/dev-proxy.mjs
 *
 * Routes (all prefixed /api/designer/records):
 *   POST   /:entity          → Dataverse create
 *   PATCH  /:entity/:id      → Dataverse update
 *   DELETE /:entity/:id      → Dataverse delete
 *   GET    /:entity/:id      → Dataverse retrieveRecord
 *   GET    /:entity          → Dataverse retrieveMultipleRecords
 */

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Load .env.proxy
// ---------------------------------------------------------------------------

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(ROOT, '.env.proxy');

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} else {
  console.warn('[proxy] No .env.proxy found — falling back to process env');
}

const TENANT_ID = process.env.AZURE_TENANT_ID ?? '';
const CLIENT_ID = process.env.AZURE_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET ?? '';
const DATAVERSE_URL = (process.env.DATAVERSE_URL ?? 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const PORT = parseInt(process.env.PROXY_PORT ?? '3001', 10);
const CORS_ORIGIN = process.env.PROXY_CORS_ORIGIN ?? '*';

if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('[proxy] Missing AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

let cachedToken = '';
let tokenExpiresAt = 0;

async function acquireToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: `${DATAVERSE_URL}/.default`,
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );

  if (!res.ok) {
    throw new Error(`Token acquisition failed ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + json.expires_in * 1000;
  console.log('[proxy] Acquired Dataverse token (expires in', json.expires_in, 's)');
  return cachedToken;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res, status, message) {
  sendJson(res, status >= 100 && status < 600 ? status : 500, {
    success: false,
    error: { message },
  });
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Dataverse forwarding
// ---------------------------------------------------------------------------

const ODATA_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

/**
 * Dataverse OData uses plural "entity set names" while Xrm.WebApi (and our
 * services) use singular logical names.  Apply standard English pluralisation.
 *   qdb_form_definition   → qdb_form_definitions
 *   qdb_form_access_policy → qdb_form_access_policies
 */
function toEntitySetName(logicalName) {
  if (logicalName.endsWith('policy')) return logicalName.slice(0, -1) + 'ies';
  if (logicalName.endsWith('y')) return logicalName.slice(0, -1) + 'ies';
  if (logicalName.endsWith('s')) return logicalName; // already plural
  return logicalName + 's';
}

async function callDataverse(token, method, entityName, id, queryString, bodyStr) {
  const setName = toEntitySetName(entityName);
  const segment = id ? `${setName}(${id})` : setName;
  const url = `${ODATA_BASE}/${segment}${queryString}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
  };
  if (bodyStr) headers['Content-Type'] = 'application/json';

  return fetch(url, { method, headers, body: bodyStr || undefined });
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

const ROUTE_RE = /^\/api\/designer\/records\/([^/?]+)(?:\/([^/?]+))?$/;

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const rawUrl = req.url ?? '/';
  const qIdx = rawUrl.indexOf('?');
  const path = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx);
  const queryString = qIdx === -1 ? '' : rawUrl.slice(qIdx);

  const match = ROUTE_RE.exec(path);
  if (!match) {
    sendError(res, 404, `Unknown route: ${path}`);
    return;
  }

  const entityName = match[1];
  const id = match[2] ?? null;

  try {
    const token = await acquireToken();
    const bodyStr = ['POST', 'PATCH'].includes(req.method ?? '') ? await readBody(req) : null;

    console.log(`[proxy] ${req.method} /${entityName}${id ? `(${id})` : ''}${queryString}`);

    const dvRes = await callDataverse(token, req.method ?? 'GET', entityName, id, queryString, bodyStr);

    // --- POST (create) ---
    if (req.method === 'POST') {
      if (!dvRes.ok) {
        const txt = await dvRes.text();
        console.error(`[proxy] create ${entityName} → ${dvRes.status}`, txt);
        sendError(res, dvRes.status, `Dataverse create failed (${dvRes.status})`);
        return;
      }
      // Dataverse returns 204 + OData-EntityId header for creates
      const entityIdHeader =
        dvRes.headers.get('OData-EntityId') ?? dvRes.headers.get('odata-entityid') ?? '';
      const guidMatch = /\(([0-9a-f-]{36})\)/i.exec(entityIdHeader);
      const createdId = guidMatch ? guidMatch[1] : '';
      sendJson(res, 200, { success: true, data: { id: createdId, entityType: entityName } });
      return;
    }

    // --- PATCH (update) / DELETE ---
    if (req.method === 'PATCH' || req.method === 'DELETE') {
      if (!dvRes.ok) {
        const txt = await dvRes.text();
        console.error(`[proxy] ${req.method} ${entityName}(${id}) → ${dvRes.status}`, txt);
        sendError(res, dvRes.status, `Dataverse ${req.method.toLowerCase()} failed (${dvRes.status})`);
        return;
      }
      // Mirror 204 — RestWebApiAdapter short-circuits on 204 and returns void
      res.writeHead(204);
      res.end();
      return;
    }

    // --- GET ---
    if (!dvRes.ok) {
      const txt = await dvRes.text();
      console.error(`[proxy] GET ${entityName}${id ? `(${id})` : ''}${queryString} → ${dvRes.status}`, txt);
      sendError(res, dvRes.status, `Dataverse GET failed (${dvRes.status})`);
      return;
    }

    const json = await dvRes.json();

    if (id) {
      // retrieveRecord — return entity directly
      sendJson(res, 200, { success: true, data: json });
    } else {
      // retrieveMultipleRecords — translate OData { value, @odata.nextLink }
      sendJson(res, 200, {
        success: true,
        data: {
          entities: json.value ?? [],
          nextLink: json['@odata.nextLink'] ?? undefined,
        },
      });
    }
  } catch (err) {
    console.error('[proxy] Unhandled error:', err);
    sendError(res, 500, err instanceof Error ? err.message : 'Internal proxy error');
  }
});

server.listen(PORT, () => {
  console.log(`\n[designer-proxy] http://localhost:${PORT}`);
  console.log(`[designer-proxy] → ${DATAVERSE_URL}`);
  console.log(`[designer-proxy] CORS: ${CORS_ORIGIN}\n`);
});
