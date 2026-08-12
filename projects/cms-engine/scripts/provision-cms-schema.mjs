/**
 * Provisions the CMS Engine schema (CMS-ENG-001) on Dataverse.
 *
 * Authorised by the Phase 3 architecture gate, condition G-2 satisfied for
 * org5869857f. Run:
 *   node --env-file=<path-to>/.env projects/cms-engine/scripts/provision-cms-schema.mjs
 *
 * Idempotent: an entity or column that already exists is skipped, not recreated.
 *
 * Two things here are load-bearing and easy to get wrong (ADR-CMS-001):
 *   - Memo columns carrying payloads MUST set MaxLength to PAYLOAD_MAX_LENGTH.
 *     The Dataverse default is 2000, which would truncate the first real page
 *     and breach NFR-09 silently. Asserted by AC-08.1.
 *   - msst_cmsmediaasset carries no binary column yet. Gate condition G-1 has
 *     to decide File column versus note attachment first.
 */

const PUBLISHER_PREFIX = 'msst';
const SOLUTION_NAME = 'MssCmsEngine';
const PUBLISHER_UNIQUE_NAME = 'MSST';

/** Dataverse Memo maximum. The default on a new column is 2000 — see AC-08.1. */
const PAYLOAD_MAX_LENGTH = 1048576;

const DATAVERSE_URL = process.env.DV_DATAVERSE_URL;
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

// ── Schema definition ────────────────────────────────────────────────────────

const TEXT = (name, displayName, maxLength = 200) => ({
  kind: 'text',
  name,
  displayName,
  maxLength,
});
const MEMO = (name, displayName, maxLength = 4000) => ({
  kind: 'memo',
  name,
  displayName,
  maxLength,
});
const PAYLOAD = (name, displayName) => MEMO(name, displayName, PAYLOAD_MAX_LENGTH);
const INT = (name, displayName) => ({ kind: 'int', name, displayName });
const BOOL = (name, displayName) => ({ kind: 'bool', name, displayName });
const DATETIME = (name, displayName) => ({ kind: 'datetime', name, displayName });
const CHOICE = (name, displayName, options) => ({ kind: 'choice', name, displayName, options });

/**
 * Entity list. `primary` is the primary name attribute; Dataverse requires one
 * and it must be a string.
 */
const ENTITIES = [
  {
    name: 'cmspage',
    display: 'CMS Page',
    plural: 'CMS Pages',
    primary: { name: 'slug', displayName: 'Slug' },
    columns: [
      TEXT('titleen', 'Title (English)', 400),
      TEXT('titlear', 'Title (Arabic)', 400),
      CHOICE('status', 'Status', [
        ['Draft', 100000000],
        ['In Review', 100000001],
        ['Published', 100000002],
        ['Unpublished', 100000003],
      ]),
      CHOICE('classification', 'Classification', [
        ['Standard', 100000000],
        ['Regulated', 100000001],
      ]),
    ],
  },
  {
    name: 'cmspageversion',
    display: 'CMS Page Version',
    plural: 'CMS Page Versions',
    primary: { name: 'versionlabel', displayName: 'Version Label' },
    columns: [
      INT('versionnumber', 'Version Number'),
      PAYLOAD('contentjson', 'Content JSON (gzip + Base64)'),
      BOOL('islatest', 'Is Latest'),
      TEXT('schemaversion', 'Schema Version', 20),
    ],
  },
  {
    name: 'cmsrendercache',
    display: 'CMS Render Cache',
    plural: 'CMS Render Caches',
    primary: { name: 'cachekey', displayName: 'Cache Key' },
    columns: [
      PAYLOAD('runtimejson', 'Runtime JSON (gzip + Base64)'),
      TEXT('languagecode', 'Language Code', 10),
    ],
  },
  {
    name: 'cmspublishlog',
    display: 'CMS Publish Log',
    plural: 'CMS Publish Logs',
    primary: { name: 'logkey', displayName: 'Log Key' },
    columns: [
      TEXT('action', 'Action', 100),
      INT('versionnumber', 'Version Number'),
      DATETIME('publishedon', 'Published On'),
      TEXT('publishedby', 'Published By', 200),
      TEXT('routekey', 'Route Key', 100),
      TEXT('approvalid', 'Approval Id', 100),
    ],
  },
  {
    name: 'cmsmediaasset',
    display: 'CMS Media Asset',
    plural: 'CMS Media Assets',
    primary: { name: 'assetkey', displayName: 'Asset Key' },
    // No binary column: gate condition G-1 decides File column vs note attachment.
    columns: [
      TEXT('kind', 'Kind', 50),
      TEXT('alttexten', 'Alt Text (English)', 400),
      TEXT('alttextar', 'Alt Text (Arabic)', 400),
    ],
  },
  {
    name: 'cmsicon',
    display: 'CMS Icon',
    plural: 'CMS Icons',
    primary: { name: 'iconkey', displayName: 'Icon Key' },
    columns: [MEMO('geometry', 'Geometry', 100000)],
  },
  {
    name: 'cmsthemetoken',
    display: 'CMS Theme Token',
    plural: 'CMS Theme Tokens',
    primary: { name: 'slug', displayName: 'Slug' },
    columns: [
      TEXT('tokentype', 'Token Type', 50),
      TEXT('value', 'Value', 200),
      TEXT('scope', 'Scope', 50),
    ],
  },
  {
    name: 'cmsnavigation',
    display: 'CMS Navigation',
    plural: 'CMS Navigations',
    primary: { name: 'navigationlabel', displayName: 'Navigation Label' },
    columns: [INT('versionnumber', 'Version Number'), PAYLOAD('treejson', 'Tree JSON')],
  },
  {
    name: 'cmsapprovalroute',
    display: 'CMS Approval Route',
    plural: 'CMS Approval Routes',
    primary: { name: 'routekey', displayName: 'Route Key' },
    columns: [
      CHOICE('classification', 'Classification', [
        ['Standard', 100000000],
        ['Regulated', 100000001],
      ]),
      TEXT('approverteamid', 'Approver Team Id', 100),
    ],
  },
  {
    name: 'cmsapproval',
    display: 'CMS Approval',
    plural: 'CMS Approvals',
    primary: { name: 'approvalkey', displayName: 'Approval Key' },
    columns: [
      TEXT('pageversionid', 'Page Version Id', 100),
      TEXT('routekey', 'Route Key', 100),
      CHOICE('decision', 'Decision', [
        ['Pending', 100000000],
        ['Approved', 100000001],
        ['Returned', 100000002],
      ]),
      TEXT('decidedby', 'Decided By', 200),
      DATETIME('decidedon', 'Decided On'),
    ],
  },
];

// ── Dataverse plumbing ───────────────────────────────────────────────────────

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
  if (!res.ok) throw new Error(`Token request failed ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

/**
 * The solution header tells Dataverse which solution to add new components to.
 * It must be omitted on the call that creates the solution itself, and on reads.
 */
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

/**
 * Two transient failures show up reliably when creating metadata in bulk:
 *
 *   ECONNRESET — entity creation takes long enough for Dataverse to drop the
 *   socket. The request usually completed server-side, so callers re-check
 *   existence rather than assuming failure.
 *
 *   0x80040216 "An unexpected error occurred" — returned when an attribute is
 *   added to an entity Dataverse has not finished settling. Observed on two
 *   different columns, and succeeding on retry both times, so it is timing and
 *   not a bad definition.
 */
const TRANSIENT_SOCKET = /ECONNRESET|ETIMEDOUT|EPIPE/;
const TRANSIENT_DATAVERSE = /0x80040216/;

function isTransient(error) {
  return (
    TRANSIENT_SOCKET.test(String(error?.cause?.code ?? '')) ||
    TRANSIENT_DATAVERSE.test(String(error?.message ?? ''))
  );
}

async function apiPost(token, path, body, options = {}) {
  const { retries = 4, ...headerOptions } = options;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(`${API_BASE}/${path}`, {
        method: 'POST',
        headers: headers(token, headerOptions),
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${text}`);
      return text ? JSON.parse(text) : null;
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === retries) throw error;
      const waitSeconds = attempt * 10;
      console.log(`    (transient failure, retrying in ${waitSeconds}s)`);
      await sleep(waitSeconds * 1000);
    }
  }
  throw lastError;
}

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: headers(token) });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

const label = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [
    { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
  ],
});

function attributeBody(column) {
  const logicalName = `${PUBLISHER_PREFIX}_${column.name}`;
  const common = {
    SchemaName: logicalName,
    DisplayName: label(column.displayName),
    RequiredLevel: { Value: 'None' },
  };

  switch (column.kind) {
    case 'text':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        AttributeType: 'String',
        AttributeTypeName: { Value: 'StringType' },
        MaxLength: column.maxLength,
        FormatName: { Value: 'Text' },
      };
    case 'memo':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
        AttributeType: 'Memo',
        AttributeTypeName: { Value: 'MemoType' },
        MaxLength: column.maxLength,
        Format: 'TextArea',
      };
    case 'int':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
        AttributeType: 'Integer',
        AttributeTypeName: { Value: 'IntegerType' },
        MinValue: 0,
        MaxValue: 2147483647,
      };
    case 'bool':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
        AttributeType: 'Boolean',
        AttributeTypeName: { Value: 'BooleanType' },
        DefaultValue: false,
        OptionSet: {
          '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
          TrueOption: { Value: 1, Label: label('Yes') },
          FalseOption: { Value: 0, Label: label('No') },
        },
      };
    case 'datetime':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
        AttributeType: 'DateTime',
        AttributeTypeName: { Value: 'DateTimeType' },
        Format: 'DateAndTime',
        DateTimeBehavior: { Value: 'UserLocal' },
      };
    case 'choice':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
        AttributeType: 'Picklist',
        AttributeTypeName: { Value: 'PicklistType' },
        OptionSet: {
          '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
          IsGlobal: false,
          OptionSetType: 'Picklist',
          Options: column.options.map(([text, value]) => ({ Value: value, Label: label(text) })),
        },
      };
    default:
      throw new Error(`Unknown column kind: ${column.kind}`);
  }
}

function entityBody(entity) {
  const logicalName = `${PUBLISHER_PREFIX}_${entity.name}`;
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: logicalName,
    DisplayName: label(entity.display),
    DisplayCollectionName: label(entity.plural),
    OwnershipType: 'UserOwned',
    HasActivities: false,
    HasNotes: false,
    IsActivity: false,
    Attributes: [
      {
        ...attributeBody(TEXT(entity.primary.name, entity.primary.displayName, 400)),
        IsPrimaryName: true,
      },
    ],
  };
}

// ── Run ──────────────────────────────────────────────────────────────────────

async function ensureSolution(token) {
  const existing = await apiGet(
    token,
    `solutions?$select=uniquename&$filter=uniquename eq '${SOLUTION_NAME}'`,
  );
  if (existing.value.length) {
    console.log(`  solution ${SOLUTION_NAME} already exists`);
    return;
  }
  const publisher = await apiGet(
    token,
    `publishers?$select=publisherid,customizationprefix&$filter=uniquename eq '${PUBLISHER_UNIQUE_NAME}'`,
  );
  if (!publisher.value.length) {
    throw new Error(`Publisher ${PUBLISHER_UNIQUE_NAME} not found — cannot guess a prefix owner`);
  }
  const found = publisher.value[0];
  if (found.customizationprefix !== PUBLISHER_PREFIX) {
    throw new Error(
      `Publisher ${PUBLISHER_UNIQUE_NAME} has prefix '${found.customizationprefix}', expected '${PUBLISHER_PREFIX}'`,
    );
  }
  await apiPost(token, 'solutions', {
    uniquename: SOLUTION_NAME,
    friendlyname: 'MSS CMS Engine',
    version: '1.0.0.0',
    'publisherid@odata.bind': `/publishers(${found.publisherid})`,
  });
  console.log(`  solution ${SOLUTION_NAME} created`);
}

async function entityExists(token, logicalName) {
  try {
    await apiGet(token, `EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName`);
    return true;
  } catch {
    return false;
  }
}

async function attributeExists(token, entityLogicalName, attributeLogicalName) {
  try {
    await apiGet(
      token,
      `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attributeLogicalName}')?$select=LogicalName`,
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!DATAVERSE_URL) throw new Error('DV_DATAVERSE_URL is not set');
  console.log(`Provisioning CMS Engine schema on ${DATAVERSE_URL}\n`);

  const token = await acquireToken();
  console.log('token acquired');

  await ensureSolution(token);

  let createdEntities = 0;
  let createdColumns = 0;

  for (const entity of ENTITIES) {
    const entityLogicalName = `${PUBLISHER_PREFIX}_${entity.name}`;

    if (await entityExists(token, entityLogicalName)) {
      console.log(`\n${entityLogicalName} — exists, skipping creation`);
    } else {
      try {
        await apiPost(token, 'EntityDefinitions', entityBody(entity), { intoSolution: true });
      } catch (error) {
        // A dropped socket does not mean the entity was not created.
        if (!(await entityExists(token, entityLogicalName))) throw error;
        console.log(`    (request failed but the entity exists — continuing)`);
      }
      createdEntities += 1;
      console.log(`\n${entityLogicalName} — created`);
      // Adding an attribute to an entity Dataverse has not settled returns
      // 0x80040216. Retries handle it; this just makes them rarer.
      await sleep(5000);
    }

    for (const column of entity.columns) {
      const attributeLogicalName = `${PUBLISHER_PREFIX}_${column.name}`;
      if (await attributeExists(token, entityLogicalName, attributeLogicalName)) {
        console.log(`    ${attributeLogicalName} — exists`);
        continue;
      }
      await apiPost(
        token,
        `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`,
        attributeBody(column),
        { intoSolution: true },
      );
      createdColumns += 1;
      const note = column.maxLength === PAYLOAD_MAX_LENGTH ? '  [payload, MaxLength set]' : '';
      console.log(`    ${attributeLogicalName} — created${note}`);
    }
  }

  console.log(`\nPublishing customisations…`);
  await apiPost(token, 'PublishAllXml', {});

  console.log(`\nDone. ${createdEntities} entities created, ${createdColumns} columns created.`);
}

await main();
