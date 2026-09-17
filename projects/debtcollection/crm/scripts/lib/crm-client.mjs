/**
 * crm-client.mjs
 * Dynamics 365 / Dataverse Web API auth + HTTP helpers.
 *
 * Required env vars: DV_CLIENT_ID, DV_CLIENT_SECRET, DV_DATAVERSE_URL, DV_API_VERSION
 * Platform selection:  DV_AUTH_MODE (entra | adfs | ifd | windows) — see lib/tooling-auth.mjs
 *   entra      also requires DV_TENANT_ID
 *   adfs / ifd also require DV_AUTH_AUTHORITY
 *
 * The Web API version and the token mechanism are both configuration: the same tooling reaches
 * Dynamics 365 CE 9.1 on-premises and Dataverse cloud.
 */
import { resolveAuthMode, acquireTokenForMode } from './tooling-auth.mjs';

const REQUIRED_ENV = ['DV_CLIENT_ID', 'DV_CLIENT_SECRET', 'DV_DATAVERSE_URL', 'DV_API_VERSION'];

/**
 * Reads and validates DV_* env vars. Exits with a clear message if any are missing.
 * @returns {{ tenantId: string, clientId: string, clientSecret: string, orgUrl: string, apiBase: string }}
 */
export function loadConfig() {
  const missing = REQUIRED_ENV.filter(name => !process.env[name]);
  if (missing.length > 0) {
    console.error(`[FATAL] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  const orgUrl = process.env.DV_DATAVERSE_URL.replace(/\/$/, '');
  const apiVersion = process.env.DV_API_VERSION;
  if (!/^\d+\.\d+$/.test(apiVersion)) {
    console.error(`[FATAL] DV_API_VERSION must look like "9.1" (on-premises) or "9.2" (cloud) — got "${apiVersion}"`);
    process.exit(1);
  }
  const authMode = resolveAuthMode();
  if (authMode === 'entra' && !process.env.DV_TENANT_ID) {
    console.error('[FATAL] DV_TENANT_ID is required when DV_AUTH_MODE=entra');
    process.exit(1);
  }
  if ((authMode === 'adfs' || authMode === 'ifd') && !process.env.DV_AUTH_AUTHORITY) {
    console.error(`[FATAL] DV_AUTH_AUTHORITY is required when DV_AUTH_MODE=${authMode}`);
    process.exit(1);
  }
  return {
    tenantId:     process.env.DV_TENANT_ID,
    clientId:     process.env.DV_CLIENT_ID,
    clientSecret: process.env.DV_CLIENT_SECRET,
    authority:    process.env.DV_AUTH_AUTHORITY,
    authMode,
    orgUrl,
    apiVersion,
    apiBase: `${orgUrl}/api/data/v${apiVersion}`,
  };
}

/**
 * Acquires a bearer token via client-credentials flow.
 * @param {{ tenantId: string, clientId: string, clientSecret: string, orgUrl: string }} cfg
 * @returns {Promise<string>}
 */
export async function acquireToken(cfg) {
  return acquireTokenForMode(cfg, cfg.authMode);
}

/**
 * Builds standard Dataverse OData v4 request headers.
 * MSCRM.SolutionUniqueName is included on every request (Constitution Article XI).
 * @param {string} token
 * @param {string} solutionName
 * @param {Record<string,string>} [extra]
 * @returns {Record<string,string>}
 */
export function buildHeaders(token, solutionName, extra = {}) {
  return {
    Authorization:               `Bearer ${token}`,
    'Content-Type':              'application/json; charset=utf-8',
    Accept:                      'application/json',
    'OData-Version':             '4.0',
    'OData-MaxVersion':          '4.0',
    'MSCRM.SolutionUniqueName':  solutionName,
    ...extra,
  };
}

/**
 * GETs a Web API path. Returns null on 404; throws on other errors.
 * @param {{ apiBase: string }} cfg
 * @param {string} token
 * @param {string} solutionName
 * @param {string} path
 * @returns {Promise<object|null>}
 */
export async function apiGet(cfg, token, solutionName, path) {
  const res = await fetch(`${cfg.apiBase}${path}`, { headers: buildHeaders(token, solutionName) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * POSTs to a Web API path. Returns { status, entityId, data }.
 * @param {{ apiBase: string }} cfg
 * @param {string} token
 * @param {string} solutionName
 * @param {string} path
 * @param {object} body
 * @returns {Promise<{ status: number, entityId: string|null, data: object|null }>}
 */
const POST_ATTEMPTS = 4;
const POST_RETRY_DELAY_MS = 20000;

/** @param {number} ms */
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * A 429 here is the platform customization lock (a previous metadata change is still
 * committing) and a fetch failure is a dropped connection; both clear within seconds.
 * @param {Error} err
 */
function isTransientPostFailure(err) {
  return /\u2192 429:/.test(err.message) || /fetch failed/i.test(err.message);
}

async function postOnce(cfg, token, solutionName, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method:  'POST',
    headers: buildHeaders(token, solutionName),
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} \u2192 ${res.status}: ${await res.text()}`);
  const location = res.headers.get('OData-EntityId') ?? res.headers.get('Location') ?? null;
  const entityId = location ? (location.match(/\(([^)]+)\)$/) ?? [])[1] ?? null : null;
  const isJson = (res.headers.get('Content-Type') ?? '').includes('application/json');
  const data = (res.status !== 204 && isJson) ? await res.json() : null;
  return { status: res.status, entityId, data };
}

/**
 * POST with a bounded retry on transient failures; permanent errors surface immediately.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} path @param {object} body
 */
export async function apiPost(cfg, token, solutionName, path, body) {
  for (let attempt = 1; ; attempt++) {
    try { return await postOnce(cfg, token, solutionName, path, body); }
    catch (err) {
      if (attempt >= POST_ATTEMPTS || !isTransientPostFailure(err)) throw err;
      console.warn(`    [RETRY ${attempt}] ${path}: ${err.message.slice(0, 80)}`);
      await wait(POST_RETRY_DELAY_MS);
    }
  }
}

/**
 * PUT for metadata updates. Dataverse requires the full definition back with MSCRM.MergeLabels
 * so existing labels survive; the body is the retrieved definition with the changed properties.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} path @param {object} body
 */
export async function apiPut(cfg, token, solutionName, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method:  'PUT',
    headers: buildHeaders(token, solutionName, { 'MSCRM.MergeLabels': 'true' }),
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} -> ${res.status}: ${await res.text()}`);
  return res.status;
}
