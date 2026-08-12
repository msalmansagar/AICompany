/**
 * Provisions the lookups between CMS entities.
 *
 * Missed by the first provisioning pass, which created entities and columns but
 * no relationships — caught when the publish plugin needed msst_pageid to find
 * a page's latest version. Entities without relationships look complete and are
 * not.
 *
 * Run:
 *   node --env-file=<path>/.env projects/cms-engine/scripts/provision-cms-relationships.mjs
 *
 * Idempotent.
 */

const SOLUTION_NAME = 'MssCmsEngine';
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL;
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

/**
 * referencing entity holds the lookup; referenced entity is pointed at.
 * Cascade: versions and logs belong to their page, so deleting a page removes
 * them. Approvals belong to the version they approved, for the same reason.
 */
const RELATIONSHIPS = [
  {
    schemaName: 'msst_cmssite_cmspage',
    referenced: 'msst_cmssite',
    referencing: 'msst_cmspage',
    lookup: 'msst_siteid',
    lookupDisplay: 'Site',
  },
  {
    schemaName: 'msst_cmssite_cmsnavigation',
    referenced: 'msst_cmssite',
    referencing: 'msst_cmsnavigation',
    lookup: 'msst_siteid',
    lookupDisplay: 'Site',
  },
  {
    schemaName: 'msst_cmspage_cmspageversion',
    referenced: 'msst_cmspage',
    referencing: 'msst_cmspageversion',
    lookup: 'msst_pageid',
    lookupDisplay: 'Page',
  },
  {
    schemaName: 'msst_cmspage_cmspublishlog',
    referenced: 'msst_cmspage',
    referencing: 'msst_cmspublishlog',
    lookup: 'msst_pageid',
    lookupDisplay: 'Page',
  },
  {
    schemaName: 'msst_cmspage_cmsrendercache',
    referenced: 'msst_cmspage',
    referencing: 'msst_cmsrendercache',
    lookup: 'msst_pageid',
    lookupDisplay: 'Page',
  },
  {
    schemaName: 'msst_cmspageversion_cmsapproval',
    referenced: 'msst_cmspageversion',
    referencing: 'msst_cmsapproval',
    lookup: 'msst_versionid',
    lookupDisplay: 'Page Version',
  },
];

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

function headers(token, { intoSolution = false } = {}) {
  const base = {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  return intoSolution ? { ...base, 'MSCRM.SolutionUniqueName': SOLUTION_NAME } : base;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: headers(token) });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function apiPost(token, path, body, options = {}) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(`${API_BASE}/${path}`, {
        method: 'POST',
        headers: headers(token, options),
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${text}`);
      return text ? JSON.parse(text) : null;
    } catch (error) {
      const transient =
        /ECONNRESET|ETIMEDOUT|EPIPE/.test(String(error?.cause?.code ?? '')) ||
        /0x80040216/.test(String(error?.message ?? ''));
      if (!transient || attempt === 4) throw error;
      console.log(`    (transient failure, retrying in ${attempt * 10}s)`);
      await sleep(attempt * 10_000);
    }
  }
}

const label = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [
    { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
  ],
});

async function relationshipExists(token, schemaName) {
  try {
    await apiGet(token, `RelationshipDefinitions(SchemaName='${schemaName}')?$select=SchemaName`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!DATAVERSE_URL) throw new Error('DV_DATAVERSE_URL is not set');
  console.log(`Provisioning CMS relationships on ${DATAVERSE_URL}\n`);

  const token = await acquireToken();
  let created = 0;

  for (const relationship of RELATIONSHIPS) {
    if (await relationshipExists(token, relationship.schemaName)) {
      console.log(`${relationship.schemaName} — exists`);
      continue;
    }

    await apiPost(
      token,
      'RelationshipDefinitions',
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
        SchemaName: relationship.schemaName,
        ReferencedEntity: relationship.referenced,
        ReferencingEntity: relationship.referencing,
        CascadeConfiguration: {
          Assign: 'NoCascade',
          Delete: 'Cascade',
          Merge: 'NoCascade',
          Reparent: 'NoCascade',
          Share: 'NoCascade',
          Unshare: 'NoCascade',
        },
        Lookup: {
          '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
          SchemaName: relationship.lookup,
          DisplayName: label(relationship.lookupDisplay),
          RequiredLevel: { Value: 'None' },
        },
      },
      { intoSolution: true },
    );
    created += 1;
    console.log(`${relationship.schemaName} — created (${relationship.referencing}.${relationship.lookup})`);
  }

  console.log(`\nPublishing customisations…`);
  await apiPost(token, 'PublishAllXml', {});
  console.log(`Done. ${created} relationship(s) created.`);
}

await main();
