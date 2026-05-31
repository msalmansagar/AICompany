'use strict';
const { spawnSync } = require('child_process');
const https = require('https');
const path = require('path');

const TOKEN_CACHE = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'PowerAppsCLI', 'tokencache_msalv3.dat');
const ORG_URL = 'https://org5869857f.crm4.dynamics.com';

function readMsalCache() {
  const escaped = TOKEN_CACHE.replace(/\\/g, '\\\\');
  const ps = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -AssemblyName System.Security;` +
    `$b=[IO.File]::ReadAllBytes('${escaped}');` +
    `$d=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser');` +
    `[Text.Encoding]::UTF8.GetString($d)`,
  ], { encoding: 'utf8' });
  return JSON.parse(ps.stdout.trim());
}

function refreshToken(cache) {
  const sampleKey = Object.keys(cache.AccessToken)[0];
  const clientId = sampleKey.match(/accesstoken-([0-9a-f-]{36})-/i)[1];
  const tenantId = sampleKey.match(/([0-9a-f-]{36})-login\.windows\.net/i)[1];
  const rtKey = Object.keys(cache.RefreshToken)[0];
  const refreshToken = cache.RefreshToken[rtKey].secret;
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: `${ORG_URL}//.default`,
  }).toString();
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'login.microsoftonline.com',
      path: `/${tenantId}/oauth2/v2.0/token`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d).access_token)); });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function getToken() {
  const cache = readMsalCache();
  const orgHost = ORG_URL.replace(/^https?:\/\//, '');
  const key = Object.keys(cache.AccessToken).find(k => k.includes(orgHost));
  const entry = cache.AccessToken[key];
  if (Date.now() / 1000 <= parseInt(entry.expires_on, 10)) return entry.secret;
  return refreshToken(cache);
}

function apiGet(token, apiPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'org5869857f.crm4.dynamics.com',
      path: `/api/data/v9.2/${apiPath}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject); req.end();
  });
}

(async () => {
  const token = await getToken();
  const entities = ['qdb_form_definition', 'qdb_form_tab', 'qdb_form_section', 'qdb_form_field'];
  for (const entity of entities) {
    const result = await apiGet(token,
      `EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName,AttributeType&$orderby=LogicalName`
    );
    const attrs = (result.value || []).filter(a => a.LogicalName.startsWith('qdb_'));
    console.log(`\n=== ${entity} (${attrs.length} qdb_ attrs) ===`);
    attrs.forEach(a => console.log(`  ${a.LogicalName}  [${a.AttributeType}]`));
  }
})().catch(err => { console.error(err.message); process.exit(1); });
