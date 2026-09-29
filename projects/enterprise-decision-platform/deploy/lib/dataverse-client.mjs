// Minimal Dataverse Web API client for the A7 tools. The tools take a client object rather
// than calling fetch themselves, so every planning and rollback path can be tested against
// an in-memory fake without touching an org.

import { readFileSync } from 'node:fs';

const API_PATH = '/api/data/v9.2';

/** Read KEY=VALUE lines from the credentials file named by EDP_ENV_PATH. */
export function readEnvironmentFile(envPath) {
  if (!envPath) throw new Error('Set EDP_ENV_PATH to the .env file holding AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and DATAVERSE_URL.');
  const entries = readFileSync(envPath, 'utf8').split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim().replace(/^"|"$/g, '')]);
  return Object.fromEntries(entries);
}

async function acquireToken(settings, orgUrl) {
  const body = new URLSearchParams({
    client_id: settings.AZURE_CLIENT_ID, client_secret: settings.AZURE_CLIENT_SECRET,
    grant_type: 'client_credentials', scope: `${orgUrl}/.default`,
  });
  const response = await fetch(`https://login.microsoftonline.com/${settings.AZURE_TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', body });
  if (!response.ok) throw new Error(`token request failed: HTTP ${response.status}`);
  return (await response.json()).access_token;
}

/**
 * Create a client exposing get(path) and patch(path, body) and post(path, body).
 * There is deliberately no delete: nothing in A7 may remove a registration or evidence.
 */
export async function createDataverseClient(envPath = process.env.EDP_ENV_PATH) {
  const settings = readEnvironmentFile(envPath);
  const orgUrl = settings.DATAVERSE_URL.replace(/\/$/, '');
  const token = await acquireToken(settings, orgUrl);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' };
  const send = async (method, path, body, extraHeaders = {}) => {
    const response = await fetch(`${orgUrl}${API_PATH}/${path}`, { method, headers: { ...headers, ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} failed: HTTP ${response.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  return {
    orgUrl,
    get: (path) => send('GET', path),
    /** Raw bytes of a file column (e.g. pluginpackages(id)/package/$value). */
    getBytes: async (path) => {
      const response = await fetch(`${orgUrl}${API_PATH}/${path}`, { headers: { Authorization: headers.Authorization } });
      if (!response.ok) throw new Error(`GET ${path} failed: HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
    patch: (path, body) => send('PATCH', path, body),
    post: (path, body, extraHeaders) => send('POST', path, body, extraHeaders),
  };
}

/** Follow @odata.nextLink so an inventory never silently truncates at one page. */
export async function getAll(client, path) {
  const rows = [];
  let page = await client.get(path);
  rows.push(...page.value);
  while (page['@odata.nextLink']) {
    page = await client.get(page['@odata.nextLink'].replace(/^.*\/api\/data\/v9\.2\//, ''));
    rows.push(...page.value);
  }
  return rows;
}
