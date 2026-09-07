'use strict';

// deploy-cloud.js — deploys web resources directly to D365 cloud via Dataverse Web API.
//
// Usage:  node scripts/deploy-cloud.js [--url https://org5869857f.crm4.dynamics.com/]
// Auth:   reuses the token cached by pac CLI (pac auth create --url <orgUrl>)
//
// Prereqs:
//   npm install -g @microsoft/powerplatform-cli   (for initial auth)
//   pac auth create --url https://yourorg.crm4.dynamics.com  (once per org)

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const ROOT      = path.join(__dirname, '..');
const DIST_DIR  = path.join(ROOT, 'deploy', 'webresources', 'qdb_', 'form-designer');
const TOKEN_CACHE = path.join(
  process.env.LOCALAPPDATA,
  'Microsoft', 'PowerAppsCLI', 'tokencache_msalv3.dat'
);

// ─── Args ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const urlIdx = args.indexOf('--url');
  if (urlIdx !== -1 && args[urlIdx + 1]) return args[urlIdx + 1].replace(/\/$/, '');
  return 'https://org5869857f.crm4.dynamics.com';
}

// ─── Token ────────────────────────────────────────────────────────────────────

function readMsalCache() {
  const ps = spawnSync('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -AssemblyName System.Security;` +
    `$b=[IO.File]::ReadAllBytes('${TOKEN_CACHE.replace(/\\/g, '\\\\')}');` +
    `$d=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser');` +
    `[Text.Encoding]::UTF8.GetString($d)`,
  ], { encoding: 'utf8' });

  if (ps.status !== 0) throw new Error('Cannot read pac token cache:\n' + ps.stderr);
  return JSON.parse(ps.stdout.trim());
}

function refreshAccessToken(cache, scope) {
  // Extract client ID and tenant ID from any AccessToken key in the cache.
  const sampleKey = Object.keys(cache.AccessToken || {})[0] ?? '';
  // Key format: <uid>.<tenant>-login.windows.net-accesstoken-<clientId>-<tenant>-<scope>
  const clientIdMatch = sampleKey.match(/accesstoken-([0-9a-f-]{36})-/i);
  const tenantMatch   = sampleKey.match(/([0-9a-f-]{36})-login\.windows\.net/i);
  if (!clientIdMatch || !tenantMatch) throw new Error('Cannot parse client/tenant ID from token cache key.');

  const clientId = clientIdMatch[1];
  const tenantId = tenantMatch[1];
  const rtKey = Object.keys(cache.RefreshToken || {})[0];
  if (!rtKey) throw new Error('No refresh token in pac CLI cache. Run: pac auth create');
  const refreshToken = cache.RefreshToken[rtKey].secret;

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope,
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'login.microsoftonline.com',
      path: `/${tenantId}/oauth2/v2.0/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.access_token) resolve(parsed.access_token);
        else reject(new Error(`Token refresh failed: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Service-principal (client-credentials) token. Used when DV_TENANT_ID / DV_CLIENT_ID /
// DV_CLIENT_SECRET are present (e.g. run with `node --env-file=../scripts/.env`), so the
// deploy works headless / without a live pac CLI login. Returns a Promise<string>.
function getServicePrincipalToken(orgUrl) {
  const tenantId = process.env.DV_TENANT_ID;
  const clientId = process.env.DV_CLIENT_ID;
  const clientSecret = process.env.DV_CLIENT_SECRET;
  const scope = `${orgUrl.replace(/\/$/, '')}/.default`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'login.microsoftonline.com',
      path: `/${tenantId}/oauth2/v2.0/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.access_token) resolve(parsed.access_token);
        else reject(new Error(`Service-principal token request failed: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getBearerToken(orgUrl) {
  // Prefer a service principal when its env vars are configured — no pac CLI dependency.
  if (process.env.DV_TENANT_ID && process.env.DV_CLIENT_ID && process.env.DV_CLIENT_SECRET) {
    console.log('Auth: service principal (DV_* env vars)');
    return getServicePrincipalToken(orgUrl);
  }

  const cache = readMsalCache();
  const orgHost = orgUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const key = Object.keys(cache.AccessToken || {}).find(k => k.includes(orgHost));
  if (!key) throw new Error(`No cached token for ${orgUrl}. Run: pac auth create --url "${orgUrl}"`);

  const entry = cache.AccessToken[key];
  const expiresOn = parseInt(entry.expires_on, 10);

  if (Date.now() / 1000 <= expiresOn) return entry.secret;

  // Access token expired — use the refresh token to get a new one silently.
  console.log('Access token expired — refreshing silently via refresh token...');
  const scope = `${orgUrl.replace(/\/$/, '')}//.default`;
  return refreshAccessToken(cache, scope);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function walkDir(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full, base));
    else results.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return results;
}

function getType(ext) {
  return { '.html':1, '.css':2, '.js':3, '.xml':4, '.png':5, '.jpg':6, '.gif':7, '.ico':10, '.svg':11 }[ext.toLowerCase()] ?? 3;
}

// ─── Dataverse Web API ────────────────────────────────────────────────────────

function apiRequest(method, orgUrl, path, token, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: new URL(orgUrl).hostname,
      path: `/api/data/v9.2/${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        ...(body ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...extraHeaders,
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(bodyStr);
    req.end();
  });
}

async function findWebResource(orgUrl, token, name) {
  // Node.js v21+ rejects unescaped spaces/quotes in path — encode the full filter value.
  const filter = encodeURIComponent(`name eq '${name}'`);
  const r = await apiRequest('GET', orgUrl, `webresourceset?$filter=${filter}&$select=webresourceid`, token);
  const parsed = JSON.parse(r.body);
  return parsed.value?.[0]?.webresourceid ?? null;
}

// Web resources created without this header land in the Default solution, not in
// FormDesignerWebResource. Everything still WORKS on the org that was deployed to,
// so nothing looks wrong — but exporting the solution then carries none of them,
// and importing that export elsewhere ships an app missing its own files. That is
// how on-premise ended up running the designer with no stylesheet.
const SOLUTION_UNIQUE_NAME = 'FormDesignerWebResource';

async function upsertWebResource(orgUrl, token, name, type, base64Content) {
  const body = { name, displayname: name, webresourcetype: type, content: base64Content };
  const headers = { 'MSCRM.SolutionUniqueName': SOLUTION_UNIQUE_NAME };
  const existingId = await findWebResource(orgUrl, token, name);

  if (existingId) {
    const r = await apiRequest('PATCH', orgUrl, `webresourceset(${existingId})`, token, body, headers);
    if (r.status >= 400) throw new Error(r.body);
    return 'updated';
  } else {
    const r = await apiRequest('POST', orgUrl, 'webresourceset', token, body, headers);
    if (r.status >= 400) throw new Error(r.body);
    return 'created';
  }
}

async function publishAll(orgUrl, token) {
  const r = await apiRequest('POST', orgUrl, 'PublishAllXml', token, {});
  if (r.status >= 400) throw new Error(r.body);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const orgUrl = parseArgs();

  console.log('\nForm Designer — Cloud Deploy (Direct Web API)');
  console.log('─'.repeat(48));
  console.log(`Target: ${orgUrl}`);

  if (!fs.existsSync(DIST_DIR)) {
    console.error('\nBuild output not found. Run: npm run build\n');
    process.exit(1);
  }

  let token;
  try {
    token = await getBearerToken(orgUrl);
    console.log('Auth: token ready');
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }

  const files = walkDir(DIST_DIR);
  console.log(`\nUploading ${files.length} file(s)...`);

  const failed = [];
  for (const rel of files) {
    const fullPath = path.join(DIST_DIR, rel.replace(/\//g, path.sep));
    const name = `qdb_/form-designer/${rel}`;
    const type = getType(path.extname(rel));
    const b64  = fs.readFileSync(fullPath).toString('base64');

    process.stdout.write(`  ${name} ... `);
    try {
      const action = await upsertWebResource(orgUrl, token, name, type, b64);
      console.log(action);
    } catch (err) {
      console.log('FAILED');
      console.error(`    ${err.message}`);
      failed.push(name);
    }
  }

  if (failed.length > 0) {
    console.error(`\n${failed.length} upload(s) failed.`);
    process.exit(1);
  }

  console.log('\nPublishing...');
  await publishAll(orgUrl, token);
  console.log('Published.');

  console.log('\n' + '─'.repeat(48));
  console.log('Deployment complete.');
  console.log(`\nOpen: ${orgUrl}/WebResources/qdb_/form-designer/index.html\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
