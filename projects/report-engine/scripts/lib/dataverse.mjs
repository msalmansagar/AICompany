// One way for the deployment scripts to reach a Dataverse organisation.
//
// Thirty-four scripts each carried their own copy of loadEnv and getToken, and every one of them
// obtained a token from login.microsoftonline.com with a client secret. There is no Entra tenant on
// an on-premises deployment, so all thirty-four were cloud-only — which made "port the scripts"
// sound like thirty-four jobs when it is one.
//
// Auth is chosen with DV_AUTH_MODE:
//   entra    (default) Microsoft Entra client credentials. Dataverse online. Unchanged behaviour.
//   adfs               OAuth against an ADFS server. Internet-facing (IFD) on-premises deployments.
//   windows            Negotiate/NTLM as the signed-in Windows account. Internal on-premises.
//
// ⚠️ NOT TESTED AGAINST AN ON-PREMISES ORGANISATION. The entra path is exercised daily against
// org5869857f; adfs and windows are written from the documented protocols and have never been run.
// Treat the first run of either as a test of this file, not of your environment.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** KEY=value lines, quotes stripped. Comments and blanks ignored. */
export function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const baseUrlOf = env => (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || '').replace(/\/$/, '');

async function postForm(url, fields) {
  const response = await fetch(url, { method: 'POST', body: new URLSearchParams(fields) });
  if (!response.ok) throw new Error(`token ${response.status}: ${await response.text()}`);
  return (await response.json()).access_token;
}

/** Entra client credentials — Dataverse online. */
const entraToken = (env, baseUrl) => postForm(
  `https://login.microsoftonline.com/${env.DV_TENANT_ID || env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
  {
    grant_type: 'client_credentials',
    client_id: env.DV_CLIENT_ID || env.AZURE_CLIENT_ID,
    client_secret: env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET,
    scope: `${baseUrl}/.default`
  });

/* ADFS predates the v2 endpoint and wants `resource`, not `scope`. A v2-shaped request is accepted
   and returns a token the organisation then rejects, which presents as 401 on every call rather
   than as a bad token request — so the difference is worth getting right here. */
function adfsToken(env, baseUrl) {
  const tokenUrl = env.DV_ADFS_TOKEN_URL
    || (env.DV_ADFS_URL ? `${env.DV_ADFS_URL.replace(/\/$/, '')}/adfs/oauth2/token` : null);
  if (!tokenUrl) throw new Error('DV_AUTH_MODE=adfs needs DV_ADFS_TOKEN_URL or DV_ADFS_URL.');

  const shared = { client_id: env.DV_CLIENT_ID, resource: baseUrl };
  if (env.DV_USERNAME) {
    return postForm(tokenUrl, {
      ...shared, grant_type: 'password', username: env.DV_USERNAME, password: env.DV_PASSWORD
    });
  }
  return postForm(tokenUrl, {
    ...shared, grant_type: 'client_credentials', client_secret: env.DV_CLIENT_SECRET
  });
}

/* Windows integrated auth has no bearer token — the handshake belongs to the transport, and Node's
   fetch speaks neither Negotiate nor NTLM. curl.exe ships with Windows 10, 11 and Server 2019+ and
   does, so requests are handed to it rather than adding a dependency to a scripts folder that has
   deliberately had none. */
function curlRequest(baseUrl, url, init = {}) {
  const args = ['--silent', '--show-error', '--negotiate', '--user', ':', '--location',
    '--write-out', '\n%{http_code}', '--request', init.method || 'GET'];
  for (const [name, value] of Object.entries(init.headers || {})) {
    args.push('--header', `${name}: ${value}`);
  }
  if (init.body) args.push('--data-binary', String(init.body));
  args.push(url);

  const raw = execFileSync('curl.exe', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lastBreak = raw.lastIndexOf('\n');
  const status = Number(raw.slice(lastBreak + 1).trim());
  const text = raw.slice(0, lastBreak);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => (text ? JSON.parse(text) : null)
  };
}

/* The Web API version is part of the URL, and the last on-premises release serves 9.1 while
   Dataverse online serves 9.2 — so a hardcoded path 404s on one of them, which reads like a
   permissions problem and is not. RetrieveVersion lives on v9.0, which every 9.x organisation
   serves, so it can be asked before the version is known. */
const FALLBACK_API_VERSION = '9.1';

async function resolveApiVersion(request, explicit) {
  if (explicit) return String(explicit).replace(/^v/, '');
  try {
    const response = await request('/api/data/v9.0/RetrieveVersion()');
    if (!response.ok) return FALLBACK_API_VERSION;
    const majorMinor = /^(\d+\.\d+)/.exec((await response.json()).Version || '');
    return majorMinor ? majorMinor[1] : FALLBACK_API_VERSION;
  } catch (error) {
    return FALLBACK_API_VERSION;
  }
}

/**
 * Opens a connection to the organisation named by the env file (or an already-loaded env object).
 *
 * @returns {Promise<{baseUrl, apiVersion, authMode, api, headers, request, fetchJson}>}
 */
export async function connect(envPathOrObject) {
  /* Every caller passes process.argv[2]. Connecting before the script reaches its own usage check
     means a forgotten argument surfaced as readFileSync(undefined) from inside this file, which
     says nothing about what the user should have typed. */
  if (!envPathOrObject) {
    throw new Error("Pass the path to a .env file: node <script>.mjs <path-to-.env>");
  }

  const env = typeof envPathOrObject === 'string' ? loadEnv(envPathOrObject) : envPathOrObject;
  const baseUrl = baseUrlOf(env);
  if (!baseUrl) throw new Error('DV_DATAVERSE_URL is not set in the env file.');

  const mode = (env.DV_AUTH_MODE || 'entra').toLowerCase();
  const bearer = await resolveBearer(mode, env, baseUrl);

  const headers = (extra = {}) => ({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    ...extra
  });

  const absolute = path => (path.startsWith('http') ? path : `${baseUrl}${path}`);
  const request = (path, init = {}) => mode === 'windows'
    ? Promise.resolve(curlRequest(baseUrl, absolute(path), { ...init, headers: headers(init.headers) }))
    : fetch(absolute(path), { ...init, headers: headers(init.headers) });

  const apiVersion = await resolveApiVersion(request, env.DV_API_VERSION);
  const api = path => `${baseUrl}/api/data/v${apiVersion}/${String(path).replace(/^\//, '')}`;

  /** Throws with the organisation's own message, which is the one worth reading. */
  const fetchJson = async (path, init) => {
    const target = path.startsWith('http') || path.startsWith('/') ? path : api(path);
    const response = await request(target, init);
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error((payload && payload.error && payload.error.message) || `${response.status} on ${path}`);
    }
    return payload;
  };

  return { baseUrl, apiVersion, authMode: mode, api, headers, request, fetchJson };
}

function resolveBearer(mode, env, baseUrl) {
  if (mode === 'entra') return entraToken(env, baseUrl);
  if (mode === 'adfs') return adfsToken(env, baseUrl);
  // Windows integrated auth carries no bearer; curl performs the handshake per request.
  if (mode === 'windows') return Promise.resolve(null);
  throw new Error(`Unknown DV_AUTH_MODE "${mode}" — use entra, adfs or windows.`);
}
