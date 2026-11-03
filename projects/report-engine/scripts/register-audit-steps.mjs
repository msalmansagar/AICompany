// Registers ReportConfigurationAuditPlugin against qdb_reportdefinition, so every configuration
// change writes a qdb_reportauditlog row.
//
// Three steps — Create, Update, Delete — all PostOperation and SYNCHRONOUS, and deliberately so:
// the audit row is written inside the same transaction as the change, so a change that cannot be
// recorded is rolled back rather than applied unrecorded. That is the same bargain report execution
// already makes, and it is the only version of an audit trail worth having.
//
// Update and Delete carry a PreImage. Without it an update records what a field became and not what
// it was, and a delete records nothing at all — the row is gone by the time the plugin runs.
//
// Idempotent: re-running updates the existing steps and images in place.
//
// Usage: node register-audit-steps.mjs <path-to-.env>
import { readFileSync } from 'node:fs';
import { connect } from './lib/dataverse.mjs';

/* One connection for the whole script: it reads the env file, authenticates by DV_AUTH_MODE
   (entra | adfs | windows) and asks the organisation which Web API version it serves. */
const dv = await connect(process.argv[2]);
const baseUrl = dv.baseUrl;
const API_PATH = `api/data/v${dv.apiVersion}`;


const SOLUTION = 'qdb_reportengine';
const PLUGIN_TYPE_NAME = 'Qdb.ReportEngine.CrmPlugin.ReportConfigurationAuditPlugin';
const ENTITY = 'qdb_reportdefinition';

const POST_OPERATION = 40;
const SYNCHRONOUS = 0;
const ACTIVE = 0;
const IMAGE_PRE = 0;

// Delete's target is only a reference, so everything the trail records has to come from the image.
const STEPS = [
  { message: 'Create', name: 'Report audit — Create', image: null },
  { message: 'Update', name: 'Report audit — Update', image: 'PreImage' },
  { message: 'Delete', name: 'Report audit — Delete', image: 'PreImage' }
];

async function main() {
  const [envPath] = process.argv.slice(2);
  if (!envPath) throw new Error('Usage: node register-audit-steps.mjs <path-to-.env>');

  const headers = () => ({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'OData-Version': '4.0',
    'MSCRM.SolutionUniqueName': SOLUTION
  });

  const api = async (method, path, body) => {
    const res = await dv.request(`${baseUrl}/${API_PATH}/${path}`, {
      method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    if (res.status === 204) return { id: (res.headers.get('OData-EntityId') || '').match(/\(([^)]+)\)/)?.[1] };
    return res.json();
  };
  const get = async path => api('GET', path);

  console.log(`== Register configuration-audit steps on ${ENTITY} ==\n`);

  const types = await get(`plugintypes?$select=plugintypeid&$filter=typename eq '${PLUGIN_TYPE_NAME}'`);
  if (!types.value.length) {
    throw new Error(`plugin type ${PLUGIN_TYPE_NAME} not found — import the assembly first`);
  }
  const pluginTypeId = types.value[0].plugintypeid;

  for (const step of STEPS) {
    const filters = await get(
      `sdkmessagefilters?$select=sdkmessagefilterid&$filter=primaryobjecttypecode eq '${ENTITY}'`
      + ` and sdkmessageid/name eq '${step.message}'`);
    if (!filters.value.length) throw new Error(`no ${step.message} filter for ${ENTITY}`);

    const messages = await get(`sdkmessages?$select=sdkmessageid&$filter=name eq '${step.message}'`);
    const existing = await get(`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=name eq '${step.name}'`);

    const body = {
      name: step.name,
      description: `Writes qdb_reportauditlog for ${step.message} on ${ENTITY}.`,
      stage: POST_OPERATION,
      mode: SYNCHRONOUS,
      rank: 1,
      statecode: ACTIVE,
      'plugintypeid@odata.bind': `/plugintypes(${pluginTypeId})`,
      'sdkmessageid@odata.bind': `/sdkmessages(${messages.value[0].sdkmessageid})`,
      'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${filters.value[0].sdkmessagefilterid})`
    };

    let stepId;
    if (existing.value.length) {
      stepId = existing.value[0].sdkmessageprocessingstepid;
      await api('PATCH', `sdkmessageprocessingsteps(${stepId})`, body);
      console.log(`  ~ step "${step.name}" updated`);
    } else {
      const created = await api('POST', 'sdkmessageprocessingsteps', body);
      stepId = created.id || created.sdkmessageprocessingstepid;
      console.log(`  + step "${step.name}" created`);
    }

    if (!step.image) continue;

    const images = await get(
      `sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid`
      + `&$filter=_sdkmessageprocessingstepid_value eq ${stepId} and entityalias eq '${step.image}'`);
    const imageBody = {
      name: step.image,
      entityalias: step.image,
      imagetype: IMAGE_PRE,
      messagepropertyname: 'Target',
      // No attribute list: an update can touch anything, and a diff missing the attribute that
      // changed is worse than no diff.
      'sdkmessageprocessingstepid@odata.bind': `/sdkmessageprocessingsteps(${stepId})`
    };
    if (images.value.length) {
      await api('PATCH', `sdkmessageprocessingstepimages(${images.value[0].sdkmessageprocessingstepimageid})`, imageBody);
      console.log(`    ~ ${step.image} updated`);
    } else {
      await api('POST', 'sdkmessageprocessingstepimages', imageBody);
      console.log(`    + ${step.image} created`);
    }
  }

  console.log('\n✓ configuration-audit steps registered.\n');
}

main().catch(error => { console.error('\n✗ ' + error.message + '\n'); process.exit(1); });
