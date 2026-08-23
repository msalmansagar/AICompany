/**
 * Publishes customizations for the named entities. Split out because PublishXml on this
 * org routinely runs past a two-minute client timeout, which made every provisioning
 * script look like it had failed after its schema change had already succeeded.
 *
 * Run: node --env-file=scripts/.env scripts/publish-entities.mjs qdb_form_tab qdb_form_definition
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

// PublishXml with <entities> does NOT publish web resources, so a designer deploy whose own
// publish step failed cannot be finished with it. --all runs PublishAllXml instead.
const publishEverything = process.argv.includes('--all');
const entities = process.argv.slice(2).filter(arg => arg !== '--all');
if (!publishEverything && entities.length === 0) {
  throw new Error('Pass at least one entity logical name, or --all.');
}
if (!process.env.DV_CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');

const tokenResponse = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: process.env.DV_CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  }),
});
const { access_token: accessToken } = await tokenResponse.json();

const requestHeaders = {
  Authorization: `Bearer ${accessToken}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
  Accept: 'application/json', 'Content-Type': 'application/json',
};

const entityXml = entities.map(name => `<entity>${name}</entity>`).join('');
const response = publishEverything
  ? await fetch(`${API_BASE}/PublishAllXml`, { method: 'POST', headers: requestHeaders, body: '{}' })
  : await fetch(`${API_BASE}/PublishXml`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({ ParameterXml: `<importexportxml><entities>${entityXml}</entities></importexportxml>` }),
  });

console.log(`${publishEverything ? 'PublishAllXml' : `PublishXml [${entities.join(', ')}]`} → ${response.status}`);
if (!response.ok) { console.error((await response.text()).slice(0, 400)); process.exit(1); }
