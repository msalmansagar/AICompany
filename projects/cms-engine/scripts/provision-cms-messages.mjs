/**
 * Provisions the CMS Engine's three message contracts as Custom APIs.
 *
 * Cloud only. Per architecture §7, on-premise declares the same three message
 * names as Custom Process Actions instead — the callers do not change, so the
 * contracts defined here are the contracts on both platforms.
 *
 * Run:
 *   node --env-file=<path>/.env projects/cms-engine/scripts/provision-cms-messages.mjs
 *
 * Idempotent. A message or parameter that already exists is skipped.
 *
 * AllowedCustomProcessingStepType is None on all three: these are governed
 * entry points, and the whole argument for routing publish through a plugin
 * (§3) collapses if anyone can bolt a step onto it.
 */

const SOLUTION_NAME = 'MssCmsEngine';
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL;
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

/** customapirequestparameter / customapiresponseproperty Type values. */
const TYPE = { BOOLEAN: 0, DATETIME: 1, ENTITY: 3, INTEGER: 7, STRING: 10, STRING_ARRAY: 11, GUID: 12 };

const BINDING_GLOBAL = 0;
const NO_CUSTOM_STEPS = 0;

const MESSAGES = [
  {
    uniqueName: 'msst_CmsPublishPage',
    displayName: 'CMS Publish Page',
    description:
      'Validates, compresses and publishes a page version, writing the render cache and the audit row in the same operation.',
    request: [
      ['PageId', 'Page Id', TYPE.GUID, false],
      ['Comment', 'Comment', TYPE.STRING, true],
    ],
    response: [
      ['PublishedVersionNumber', 'Published Version Number', TYPE.INTEGER],
      ['Message', 'Message', TYPE.STRING],
    ],
  },
  {
    uniqueName: 'msst_CmsGetPublishedPageJson',
    displayName: 'CMS Get Published Page JSON',
    description:
      'Reads the render cache, decodes and decompresses it, and returns plain JSON. Never generates.',
    request: [
      ['Site', 'Site Key', TYPE.STRING, false],
      ['Slug', 'Slug', TYPE.STRING, false],
      ['LanguageCode', 'Language Code', TYPE.STRING, false],
    ],
    response: [['PageJson', 'Page JSON', TYPE.STRING]],
  },
  {
    uniqueName: 'msst_CmsUploadIcon',
    displayName: 'CMS Upload Icon',
    description:
      'Parses an SVG, extracts allowlisted geometry, rejects anything with no drawable content, and reports what was stripped.',
    request: [
      ['IconKey', 'Icon Key', TYPE.STRING, false],
      ['SvgContent', 'SVG Content', TYPE.STRING, false],
    ],
    response: [
      ['Geometry', 'Geometry', TYPE.STRING],
      ['StrippedElements', 'Stripped Elements', TYPE.STRING_ARRAY],
    ],
  },
];

// -- Plumbing ---------------------------------------------------------------

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

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: headers(token) });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function apiPost(token, path, body, options = {}) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: headers(token, options),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${text}`);
  const id = res.headers.get('OData-EntityId');
  return id ? id.match(/\(([^)]+)\)/)?.[1] : text ? JSON.parse(text) : null;
}

// -- Run --------------------------------------------------------------------

async function findCustomApi(token, uniqueName) {
  const found = await apiGet(
    token,
    `customapis?$select=customapiid,uniquename&$filter=uniquename eq '${uniqueName}'`,
  );
  return found.value[0]?.customapiid ?? null;
}

/**
 * Scoped to the owning message. Now that UniqueName is the bare parameter name,
 * two messages can each have a `Slug`, and a global check would skip creating
 * the second one.
 */
async function parameterExists(token, set, uniqueName, customApiId) {
  const found = await apiGet(
    token,
    `${set}?$select=uniquename&$filter=uniquename eq '${uniqueName}' and _customapiid_value eq ${customApiId}`,
  );
  return found.value.length > 0;
}

async function main() {
  if (!DATAVERSE_URL) throw new Error('DV_DATAVERSE_URL is not set');
  console.log(`Provisioning CMS message contracts on ${DATAVERSE_URL}\n`);

  const token = await acquireToken();
  let createdMessages = 0;
  let createdParameters = 0;

  for (const message of MESSAGES) {
    let customApiId = await findCustomApi(token, message.uniqueName);

    if (customApiId) {
      console.log(`\n${message.uniqueName} - exists`);
    } else {
      customApiId = await apiPost(
        token,
        'customapis',
        {
          uniquename: message.uniqueName,
          name: message.uniqueName,
          displayname: message.displayName,
          description: message.description,
          bindingtype: BINDING_GLOBAL,
          isfunction: false,
          isprivate: false,
          allowedcustomprocessingsteptype: NO_CUSTOM_STEPS,
          executeprivilegename: null,
        },
        { intoSolution: true },
      );
      createdMessages += 1;
      console.log(`\n${message.uniqueName} - created`);
    }

    for (const [name, displayName, type, isOptional] of message.request) {
      // UniqueName is what a caller puts in the payload, NOT Name. Provisioning
      // these as "<message>.<Name>" made every call fail with "the parameter
      // 'PageId' is not a valid parameter", because the parameter really was
      // called "msst_CmsPublishPage.PageId".
      const uniqueName = name;
      if (await parameterExists(token, 'customapirequestparameters', uniqueName, customApiId)) {
        console.log(`    request  ${name} - exists`);
        continue;
      }
      await apiPost(
        token,
        'customapirequestparameters',
        {
          uniquename: uniqueName,
          name,
          displayname: displayName,
          type,
          isoptional: isOptional,
          'CustomAPIId@odata.bind': `/customapis(${customApiId})`,
        },
        { intoSolution: true },
      );
      createdParameters += 1;
      console.log(`    request  ${name} - created${isOptional ? ' (optional)' : ''}`);
    }

    for (const [name, displayName, type] of message.response) {
      const uniqueName = name;
      if (await parameterExists(token, 'customapiresponseproperties', uniqueName, customApiId)) {
        console.log(`    response ${name} - exists`);
        continue;
      }
      await apiPost(
        token,
        'customapiresponseproperties',
        {
          uniquename: uniqueName,
          name,
          displayname: displayName,
          type,
          'CustomAPIId@odata.bind': `/customapis(${customApiId})`,
        },
        { intoSolution: true },
      );
      createdParameters += 1;
      console.log(`    response ${name} - created`);
    }
  }

  console.log(`\nDone. ${createdMessages} messages created, ${createdParameters} parameters created.`);
}

await main();
