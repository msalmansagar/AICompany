import { fileURLToPath } from 'node:url';
const LIB = new URL('../scripts/lib/dataverse.mjs', import.meta.url).href;
const SCRIPTS = fileURLToPath(new URL('../scripts', import.meta.url));
// The one way the deployment scripts reach an organisation.
//
// Thirty-four scripts each carried their own getToken against login.microsoftonline.com, which made
// every one of them cloud-only — there is no Entra tenant on an on-premises deployment. The entra
// path here is exercised against org5869857f daily; adfs and windows are not, and cannot be from
// this machine. So what is asserted is the shape of the request each mode builds: the wrong grant
// or the wrong resource parameter comes back as a token the organisation then rejects on every
// call, which presents as 401 everywhere rather than as a bad token request.
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const { connect, loadEnv } = await import(LIB);

/** An env file on disk, because loadEnv reads one. */
function envFile(lines) {
  const dir = mkdtempSync(join(tmpdir(), 'rpt-env-'));
  const path = join(dir, '.env');
  writeFileSync(path, lines.join('\n'), 'utf8');
  return path;
}

/** Captures every fetch the module makes, and answers them. */
function withFakeFetch(handler, run) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body ? String(init.body) : null });
    return handler(String(url), init, calls);
  };
  return run(calls).finally(() => { globalThis.fetch = real; });
}

const jsonResponse = payload => ({
  ok: true, status: 200,
  text: async () => JSON.stringify(payload),
  json: async () => payload
});

const standardHandler = (url) => {
  if (url.includes('/token')) return jsonResponse({ access_token: 'TOKEN' });
  if (url.includes('RetrieveVersion')) return jsonResponse({ Version: '9.1.0.4967' });
  return jsonResponse({ value: [] });
};

console.log('reading the env file');
const path = envFile(['DV_DATAVERSE_URL=https://crm.example.com/org/', '# a comment',
  'DV_TENANT_ID="tenant-1"', "DV_CLIENT_ID='client-1'", 'DV_CLIENT_SECRET=shh']);
const env = loadEnv(path);
check('strips double quotes', env.DV_TENANT_ID === 'tenant-1');
check('strips single quotes', env.DV_CLIENT_ID === 'client-1');
check('ignores comments', env['#'] === undefined);

console.log('\nthe entra path, which is the one that already works');
await withFakeFetch(standardHandler, async calls => {
  const dv = await connect(path);
  check('drops the trailing slash off the url', dv.baseUrl === 'https://crm.example.com/org');
  const token = calls.find(c => c.url.includes('/token'));
  check('asks Microsoft for the token', token.url.startsWith('https://login.microsoftonline.com/tenant-1/'));
  check('with client credentials', token.body.includes('grant_type=client_credentials'));
  // v2 speaks scope; ADFS does not, and mixing them is the failure this pair guards.
  check('and a v2 scope', token.body.includes('scope=') && !token.body.includes('resource='));
});

console.log('\nthe adfs path, for an internet-facing on-premises org');
const adfsPath = envFile(['DV_DATAVERSE_URL=https://crm.example.com/org', 'DV_AUTH_MODE=adfs',
  'DV_ADFS_URL=https://sts.example.com', 'DV_CLIENT_ID=client-1', 'DV_CLIENT_SECRET=shh']);
await withFakeFetch(standardHandler, async calls => {
  const dv = await connect(adfsPath);
  check('reports the mode it used', dv.authMode === 'adfs');
  const token = calls.find(c => c.url.includes('/token'));
  check('goes to the ADFS token endpoint',
    token.url === 'https://sts.example.com/adfs/oauth2/token', token.url);
  // ADFS predates v2: `scope` is accepted and yields a token the org rejects on every later call.
  check('asks for a resource, not a scope',
    token.body.includes('resource=') && !token.body.includes('scope='));
});

const adfsUser = envFile(['DV_DATAVERSE_URL=https://crm.example.com/org', 'DV_AUTH_MODE=adfs',
  'DV_ADFS_TOKEN_URL=https://sts.example.com/adfs/oauth2/token',
  'DV_CLIENT_ID=client-1', 'DV_USERNAME=svc@example.com', 'DV_PASSWORD=pw']);
await withFakeFetch(standardHandler, async calls => {
  await connect(adfsUser);
  const token = calls.find(c => c.url.includes('/token'));
  check('a username switches it to the password grant',
    token.body.includes('grant_type=password') && token.body.includes('username=svc'));
});

await (async () => {
  const missing = envFile(['DV_DATAVERSE_URL=https://crm.example.com/org', 'DV_AUTH_MODE=adfs']);
  let message = '';
  await connect(missing).catch(error => { message = error.message; });
  check('and says which setting is missing when neither ADFS url is given',
    /DV_ADFS_TOKEN_URL or DV_ADFS_URL/.test(message), message);
})();

console.log('\nasking the org which Web API version it serves');
await withFakeFetch(standardHandler, async calls => {
  const dv = await connect(path);
  // RetrieveVersion lives on v9.0, which every 9.x org serves — so it can be asked first.
  check('probes on v9.0, the one version it can assume',
    calls.some(c => c.url.endsWith('/api/data/v9.0/RetrieveVersion()')));
  check('an on-premises org yields 9.1', dv.apiVersion === '9.1');
  check('and the url it builds names it',
    dv.api('accounts') === 'https://crm.example.com/org/api/data/v9.1/accounts');
});

await withFakeFetch(
  url => url.includes('/token') ? jsonResponse({ access_token: 'T' })
       : url.includes('RetrieveVersion') ? jsonResponse({ Version: '9.2.24084.00187' })
       : jsonResponse({}),
  async () => {
    const dv = await connect(path);
    check('a cloud org yields 9.2', dv.apiVersion === '9.2');
  });

await withFakeFetch(
  url => url.includes('/token') ? jsonResponse({ access_token: 'T' })
       : { ok: false, status: 404, text: async () => '', json: async () => ({}) },
  async () => {
    const dv = await connect(path);
    // 9.1 is served by cloud and on-premises alike, so it is the safe thing not to know.
    check('an org that will not say falls back to 9.1', dv.apiVersion === '9.1');
  });

const pinned = envFile(['DV_DATAVERSE_URL=https://crm.example.com/org', 'DV_TENANT_ID=t',
  'DV_CLIENT_ID=c', 'DV_CLIENT_SECRET=s', 'DV_API_VERSION=v9.0']);
await withFakeFetch(standardHandler, async calls => {
  const dv = await connect(pinned);
  check('DV_API_VERSION overrides the probe', dv.apiVersion === '9.0');
  check('and skips it entirely', !calls.some(c => c.url.includes('RetrieveVersion')));
});

console.log('\nrefusing what it cannot do');
await (async () => {
  let message = '';
  await connect(undefined).catch(error => { message = error.message; });
  check('a missing argument says what to type', /path to a \.env file/.test(message), message);

  const badMode = envFile(['DV_DATAVERSE_URL=https://crm.example.com/org', 'DV_AUTH_MODE=kerberos']);
  message = '';
  await connect(badMode).catch(error => { message = error.message; });
  check('an unknown auth mode lists the real ones',
    /entra, adfs or windows/.test(message), message);

  const noUrl = envFile(['DV_TENANT_ID=t']);
  message = '';
  await connect(noUrl).catch(error => { message = error.message; });
  check('a missing org url is named', /DV_DATAVERSE_URL/.test(message), message);
})();

console.log('\nno deployment script authenticates on its own any more');
const ONPREM_SCRIPTS = ['verify-schema', 'import-plugin-assembly', 'register-audit-steps',
  'deploy-webresources', 'provision-report-app', 'provision-report-dashboard',
  'seed-ribbon-placements', 'deploy-ribbon', 'provision-data-read-role',
  'provision-report-user-role'];
for (const name of ONPREM_SCRIPTS) {
  const src = readFileSync(join(SCRIPTS, `${name}.mjs`), 'utf8');
  const sins = [];
  if (src.includes('login.microsoftonline.com')) sins.push('builds its own Entra token');
  if (/function getToken/.test(src)) sins.push('has its own getToken');
  if (src.includes('api/data/v9.2')) sins.push('hardcodes v9.2');
  if (!src.includes("from './lib/dataverse.mjs'")) sins.push('does not use the shared connection');
  check(`${name}.mjs`, sins.length === 0, sins.join('; '));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
