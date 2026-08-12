/**
 * Deploys the CMS web resources into the MssCmsEngine solution.
 *
 * Run:
 *   node --env-file=<path>/.env projects/cms-engine/scripts/deploy-webresources.mjs
 *
 * Into MssCmsEngine explicitly, never Default. The Dynamic Form Engine's deploy
 * script created its web resources in the Default solution, so every export of
 * the real solution carried none of them and nobody noticed until an import
 * came up empty.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOLUTION_NAME = 'MssCmsEngine';
const WEBRESOURCE_TYPE_HTML = 1;

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(here, '..', 'webresources');

const DATAVERSE_URL = process.env.DV_DATAVERSE_URL;
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

async function acquireToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.DV_CLIENT_ID,
    client_secret: process.env.DV_CLIENT_SECRET,
    scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.DV_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
  );
  if (!res.ok) throw new Error(`Token request failed ${res.status}`);
  return (await res.json()).access_token;
}

let token;
const headers = (intoSolution = false) => ({
  Authorization: `Bearer ${token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  'Content-Type': 'application/json',
  ...(intoSolution ? { 'MSCRM.SolutionUniqueName': SOLUTION_NAME } : {}),
});

async function send(method, path, body, intoSolution = false) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method,
    headers: headers(intoSolution),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  const id = res.headers.get('OData-EntityId');
  return { id: id ? id.match(/\(([^)]+)\)/)?.[1] : null, body: text ? JSON.parse(text) : null };
}

async function main() {
  if (!DATAVERSE_URL) throw new Error('DV_DATAVERSE_URL is not set');
  token = await acquireToken();
  console.log(`Deploying web resources to ${DATAVERSE_URL}\n`);

  const files = readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.html'));
  const deployed = [];

  for (const fileName of files) {
    const content = readFileSync(join(SOURCE_DIR, fileName)).toString('base64');
    const existing = await send(
      'GET',
      `webresourceset?$select=webresourceid&$filter=name eq '${fileName}'`,
    );

    if (existing.body.value.length > 0) {
      const id = existing.body.value[0].webresourceid;
      await send('PATCH', `webresourceset(${id})`, { content });
      console.log(`  ${fileName} — updated`);
      deployed.push(id);
      continue;
    }

    const created = await send(
      'POST',
      'webresourceset',
      {
        name: fileName,
        displayname: fileName,
        webresourcetype: WEBRESOURCE_TYPE_HTML,
        content,
      },
      true,
    );
    console.log(`  ${fileName} — created`);
    deployed.push(created.id);
  }

  console.log('\nPublishing…');
  await send('POST', 'PublishXml', {
    ParameterXml: `<importexportxml><webresources>${deployed
      .map((id) => `<webresource>{${id}}</webresource>`)
      .join('')}</webresources></importexportxml>`,
  });

  console.log(`\nDone. ${deployed.length} web resource(s).`);
  console.log(
    `\nOpen with:\n  ${DATAVERSE_URL}/main.aspx?pagetype=webresource&webresourceName=msst_cms_viewer.html`,
  );
}

await main();
