// Provisions a native CRM dashboard that hosts the Report Engine runtime viewer, so the report
// catalogue appears in Dynamics' own dashboard list alongside every other dashboard a user has —
// not only inside the Report Engine app's navigation.
//
// This is the second of the two declarative surfaces the user asked for (the first is the sitemap,
// see provision-report-app.mjs). It is a systemform of type 0 (Dashboard) whose single cell is a
// web-resource control pointing at qdb_reportengine_runtime.html.
//
// PassParameters is on, so the viewer receives the CRM context (user, org, language) it uses to
// resolve the caller. Security is off on the control itself because access is enforced where it
// matters — the qdb_RunReport plugin, which runs as the calling user and writes the audit record.
//
// Idempotent: updates the form in place if it already exists.
//
// GOTCHA, same family as the appmodule one: a systemform is a solution component, so it is not
// reliably visible until published. This script publishes before it verifies.
//
// Usage: node provision-report-dashboard.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const SOLUTION = 'qdb_reportengine';
const APP_UNIQUE_NAME = 'qdb_ReportEngine';
const DASHBOARD_NAME = 'Report Engine — Report Catalog';
const DASHBOARD_DESCRIPTION = 'Browse and run metadata-driven reports without leaving Dynamics.';
const RUNTIME_WEB_RESOURCE = 'qdb_reportengine_runtime.html';

const SYSTEMFORM_TYPE_DASHBOARD = 0;
const FORM_ACTIVATION_ACTIVE = 1;

// The platform's web-resource control. Fixed classid — not a value to invent.
const WEB_RESOURCE_CONTROL_CLASSID = '{9FDF5F91-88B1-47f4-AD53-C11EFC01A01D}';

/* Layout ids are held constant rather than regenerated per run: the form is replaced wholesale on
   update, and stable ids keep the diff between two runs empty instead of noisy. */
const TAB_ID = '{9c1b0a10-0001-4a1e-9d61-2b0f5f7a1001}';
const SECTION_ID = '{9c1b0a10-0002-4a1e-9d61-2b0f5f7a1002}';
const CELL_ID = '{9c1b0a10-0003-4a1e-9d61-2b0f5f7a1003}';

/* The dashboard Form XML schema is markedly stricter than the entity-form one and rejects
   attributes that are legal elsewhere — `IsUserDefined` on a tab, and `name`, `layout`,
   `celllabelalignment` and `celllabelposition` on a section all fail validation on save.
   The shape below is copied from a real dashboard in this org rather than written from the
   entity-form schema. Three details are load-bearing and are NOT rejected on save — get them wrong
   and the record stores happily, then CRM silently renders a different dashboard instead:

     columns="1111"      the section declares a FOUR-column grid; "1" is accepted but does not lay out
     filler <row /> tags  a cell spanning N rows must be followed by N-1 empty rows
     <DisplayConditions>  without it the dashboard is not displayable to anyone, so it never shows

   Note the Url is the bare web-resource name: a dashboard cell does not take `$webresource:`. */
const CELL_ROW_SPAN = 24;
const FILLER_ROWS = Array(CELL_ROW_SPAN - 1).fill('<row />').join('');

const DASHBOARD_FORM_XML = `<form><tabs>`
  + `<tab showlabel="false" verticallayout="true" id="${TAB_ID}">`
  + `<labels><label description="Report Engine" languagecode="1033" /></labels>`
  + `<columns><column width="100%"><sections>`
  + `<section showlabel="false" showbar="false" columns="1111" id="${SECTION_ID}">`
  + `<labels><label description="Report Catalog" languagecode="1033" /></labels>`
  + `<rows><row>`
  + `<cell colspan="4" rowspan="${CELL_ROW_SPAN}" showlabel="false" id="${CELL_ID}">`
  + `<labels><label description="Report Catalog" languagecode="1033" /></labels>`
  + `<control id="WebResource_reportengine_catalog" classid="${WEB_RESOURCE_CONTROL_CLASSID}">`
  + `<parameters>`
  + `<Url>${RUNTIME_WEB_RESOURCE}</Url>`
  + `<PassParameters>true</PassParameters>`
  + `<Security>false</Security>`
  + `<Scrolling>auto</Scrolling>`
  + `<Border>false</Border>`
  + `</parameters></control></cell></row>${FILLER_ROWS}</rows>`
  + `</section></sections></column></columns></tab></tabs>`
  + `<DisplayConditions FallbackForm="true"><Everyone /></DisplayConditions>`
  + `</form>`;

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function getToken(tenant, clientId, secret, url) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: clientId, client_secret: secret, scope: `${url}/.default`
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', body });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

let baseUrl, token;
const headers = (extra = {}) => ({
  Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra
});

async function api(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${path}`, {
    method, headers: headers(extraHeaders), body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function createReturningId(entitySet, record, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${entitySet}`, {
    method: 'POST', headers: headers(extraHeaders), body: JSON.stringify(record)
  });
  if (!res.ok) throw new Error(`POST ${entitySet} ${res.status}: ${await res.text()}`);
  const match = (res.headers.get('OData-EntityId') || '').match(/\(([0-9a-fA-F-]{36})\)/);
  if (!match) throw new Error(`POST ${entitySet}: no id in OData-EntityId header`);
  return match[1];
}

async function findOne(entitySet, query) {
  const found = await api('GET', `${entitySet}?${query}&$top=1`);
  return (found.value || [])[0] || null;
}

async function ensureDashboard() {
  const existing = await findOne('systemforms',
    `$select=formid&$filter=name eq '${DASHBOARD_NAME.replace(/'/g, "''")}' and type eq ${SYSTEMFORM_TYPE_DASHBOARD}`);
  if (existing) {
    await api('PATCH', `systemforms(${existing.formid})`, { formxml: DASHBOARD_FORM_XML, description: DASHBOARD_DESCRIPTION });
    console.log(`  = dashboard updated (${existing.formid})`);
    return existing.formid;
  }
  const formId = await createReturningId('systemforms', {
    name: DASHBOARD_NAME, description: DASHBOARD_DESCRIPTION, type: SYSTEMFORM_TYPE_DASHBOARD,
    formxml: DASHBOARD_FORM_XML, formactivationstate: FORM_ACTIVATION_ACTIVE, isdefault: false
  }, { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log(`  + dashboard created (${formId})`);
  return formId;
}

/* THE ONE THAT MATTERS: a component-scoped PublishXml is NOT enough for a new dashboard.
   With only the <dashboards> publish, the record saves, publishes and reports healthy, yet CRM never
   lists it in the dashboard picker and silently renders a different dashboard instead — which reads
   as a broken deployment. Proven by cloning a working OOB dashboard byte-for-byte: the clone was
   invisible too, so the Form XML was never the cause. PublishAllXml makes both appear immediately. */
async function publishDashboard(formId) {
  await api('POST', 'PublishXml', {
    ParameterXml: `<importexportxml><dashboards><dashboard>${formId}</dashboard></dashboards></importexportxml>`
  });
  await api('POST', 'PublishAllXml', {});
  console.log('  ✓ dashboard published (component publish + PublishAllXml)');
}

/** Puts the dashboard inside the Report Engine app so it is offered in that app's dashboard picker. */
async function linkToApp(formId) {
  const app = await findOne('appmodules', `$select=appmoduleid&$filter=uniquename eq '${APP_UNIQUE_NAME}'`);
  if (!app) {
    console.log(`  ! app ${APP_UNIQUE_NAME} not found — run provision-report-app.mjs first; skipping link`);
    return;
  }
  await api('POST', 'AddAppComponents', {
    AppId: app.appmoduleid,
    Components: [{ '@odata.type': 'Microsoft.Dynamics.CRM.systemform', formid: formId }]
  }).then(() => console.log('  + dashboard linked to the Report Engine app'))
    .catch(error => console.log(`  ! could not link to app: ${String(error.message).slice(0, 200)}`));
  await api('POST', 'PublishXml', {
    ParameterXml: `<importexportxml><appmodules><appmodule>${app.appmoduleid}</appmodule></appmodules></importexportxml>`
  });
}

async function confirmPublished(formId) {
  const found = await findOne('systemforms', `$select=formid,name,type,formactivationstate&$filter=formid eq ${formId}`);
  if (!found) throw new Error(`dashboard ${formId} is not retrievable after publish — it did not materialise`);
  console.log(`  ✓ confirmed: "${found.name}" type=${found.type} active=${found.formactivationstate}`);
}

const env = loadEnv(process.argv[2]);
baseUrl = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
token = await getToken(
  env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID,
  env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, baseUrl);

console.log(`\n== Provision native CRM dashboard → ${baseUrl} ==\n`);
const formId = await ensureDashboard();
await publishDashboard(formId);
await linkToApp(formId);
await confirmPublished(formId);
console.log(`\n✓ dashboard id ${formId}\n`);
