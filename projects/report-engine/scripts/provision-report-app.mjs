// Provisions the "Report Engine" model-driven app and its sitemap, so the engine is reachable from
// CRM navigation rather than only by pasting a web-resource URL.
//
// Until now the wizard's "Use in CRM" step stored ribbon placements and nothing created a CRM
// artifact — the runtime viewer existed but had no entry point. This creates the first one.
//
// A DEDICATED app is created rather than editing an app QDB already uses: it is purely additive,
// leaves existing apps untouched, and can be removed without unpicking someone else's navigation.
//
// Three subareas, because the product has two audiences and two surfaces:
//   Run a report    -> qdb_reportengine_runtime.html   (needs Read on a report definition)
//   Dashboards      -> the app's native CRM dashboards (see provision-report-dashboard.mjs)
//   Report Designer -> qdb_reportengine_designer.html  (needs Write — authoring, not consumption)
//
// The Dashboards subarea is what makes the native dashboard reachable. Without it the app has no
// dashboard route at all, and CRM silently falls back to whichever dashboard it considers default
// (in this org, "Tier 1 Dashboard") — which looks like the new dashboard failed to deploy.
//
// Idempotent: reuses the sitemap and app if they already exist and re-publishes them.
//
// ---------------------------------------------------------------------------------------------
// PLATFORM BEHAVIOUR THIS SCRIPT IS BUILT AROUND — each cost real time to find:
//
//  1. A NEWLY CREATED APPMODULE IS INVISIBLE UNTIL IT IS PUBLISHED. The POST returns 204 with an
//     id, and then GET appmodules(<that id>) returns 404 "Does Not Exist" and $filter finds
//     nothing. The record is real — PublishXml accepts it — it is simply an unpublished solution
//     component. Never conclude from a failed read-back that the create failed.
//  2. Because of (1), a re-create of the same uniquename fails with 0x80050135 (an opaque
//     "-2147155681"), since duplicate detection can see what retrieve cannot. So the app MUST be
//     published in the same run that creates it, or the name is stranded — see recoverStrandedApp.
//  3. appmodule.webresourceid (the app icon) is REQUIRED and is a plain uniqueidentifier, not a
//     lookup — send the raw guid, never "@odata.bind".
//  4. appmodule rejects "Prefer: return=representation" for the same reason as (1), so the new id
//     must be taken from the OData-EntityId response header.
//  5. An app CANNOT reference a web resource as a component (0x80050112). Web resources reach the
//     app through the sitemap's $webresource: URLs, and need no explicit link.
//  6. The SiteMap root element has no SiteMapName attribute — including one fails XSD validation.
//  7. ValidateApp is an OData *function* (GET), not an action (POST).
//
// Usage: node provision-report-app.mjs <path-to-.env>
import { readFileSync } from 'node:fs';
import { connect } from './lib/dataverse.mjs';

/* One connection for the whole script: it reads the env file, authenticates by DV_AUTH_MODE
   (entra | adfs | windows) and asks the organisation which Web API version it serves. */
const dv = await connect(process.argv[2]);
const baseUrl = dv.baseUrl;
const API_PATH = `api/data/v${dv.apiVersion}`;


const SOLUTION = 'qdb_reportengine';
const SITEMAP_UNIQUE_NAME = 'qdb_reportengine_sitemap';
const APP_UNIQUE_NAME = 'qdb_ReportEngine';
const APP_NAME = 'Report Engine';
const APP_DESCRIPTION = 'Author, publish and run metadata-driven reports.';

const RUNTIME_WEB_RESOURCE = 'qdb_reportengine_runtime.html';
const DESIGNER_WEB_RESOURCE = 'qdb_reportengine_designer.html';
const APP_ICON_WEB_RESOURCE = 'qdb_reportengine_appicon.svg';

// Must match provision-report-dashboard.mjs — the two scripts find each other by this name.
const DASHBOARD_NAME = 'Report Engine — Report Catalog';

const WEB_RESOURCE_TYPE_SVG = 11;
const DUPLICATE_APP_NAME_ERROR = '0x80050135';

const APP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect x="5" y="3" width="22" height="26" rx="2" fill="none" stroke="#0f172a" stroke-width="2"/>
  <rect x="10" y="17" width="3" height="7" fill="#0f172a"/>
  <rect x="15" y="13" width="3" height="11" fill="#0f172a"/>
  <rect x="20" y="9" width="3" height="15" fill="#0f172a"/>
  <path d="M10 8h12" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/* PassParams carries the CRM context (user, org, language) onto the web-resource URL, which the
   viewer needs to resolve the caller. The Privilege elements hide a subarea from users who could
   not use it anyway — convenience, not enforcement; the plugin remains the security boundary.

   The Dashboards subarea names its dashboard explicitly via DefaultDashboard. Pointing it at the
   classic /workplace/home_dashboards.aspx instead does NOT work: that page is not app-aware, so it
   offers the org's whole system-dashboard list and never surfaces this app's own dashboard — which
   reads as "the dashboard failed to deploy" when the record is in fact perfectly healthy. */
const buildSiteMapXml = defaultDashboardId => `<SiteMap IntroducedVersion="9.0.0.0">
  <Area Id="qdb_rpt_area" Title="Report Engine" ShowGroups="true">
    <Group Id="qdb_rpt_grp_run" Title="Reports">
      <SubArea Id="qdb_rpt_sub_viewer" Title="Run a report" Url="$webresource:${RUNTIME_WEB_RESOURCE}" AvailableOffline="false" PassParams="true" Client="All">
        <Privilege Entity="qdb_reportdefinition" Privilege="Read" />
      </SubArea>
${defaultDashboardId ? `      <SubArea Id="qdb_rpt_sub_dashboards" Title="Dashboards" Url="/main.aspx?pagetype=dashboard" DefaultDashboard="{${defaultDashboardId}}" AvailableOffline="false" Client="All" />\n` : ''}    </Group>
    <Group Id="qdb_rpt_grp_author" Title="Authoring">
      <SubArea Id="qdb_rpt_sub_designer" Title="Report Designer" Url="$webresource:${DESIGNER_WEB_RESOURCE}" AvailableOffline="false" PassParams="true" Client="All">
        <Privilege Entity="qdb_reportdefinition" Privilege="Write" />
      </SubArea>
    </Group>
  </Area>
</SiteMap>`;

const headers = (extra = {}) => ({ Accept: 'application/json', 'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra
});

async function api(method, path, body, extraHeaders = {}) {
  const res = await dv.request(`${baseUrl}/${API_PATH}/${path}`, {
    method, headers: headers(extraHeaders), body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** POST that reads the new id from the OData-EntityId header — see behaviour note (4). */
async function createReturningId(entitySet, record, extraHeaders = {}) {
  const res = await dv.request(`${baseUrl}/${API_PATH}/${entitySet}`, {
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

/* Looked up by name rather than passed in, so the two provisioning scripts stay independent and
   can run in either order — the Dashboards subarea simply appears once the dashboard exists. */
async function findDashboardId() {
  const dashboard = await findOne('systemforms',
    `$select=formid&$filter=name eq '${DASHBOARD_NAME.replace(/'/g, "''")}' and type eq 0`);
  if (!dashboard) {
    console.log('  ! native dashboard not found — run provision-report-dashboard.mjs, then re-run this');
    return null;
  }
  return dashboard.formid;
}

async function ensureSiteMap(defaultDashboardId) {
  const siteMapXml = buildSiteMapXml(defaultDashboardId);
  const existing = await findOne('sitemaps', `$select=sitemapid&$filter=sitemapnameunique eq '${SITEMAP_UNIQUE_NAME}'`);
  if (existing) {
    await api('PATCH', `sitemaps(${existing.sitemapid})`, { sitemapxml: siteMapXml });
    console.log(`  = sitemap ${SITEMAP_UNIQUE_NAME} updated (${existing.sitemapid})`);
    return existing.sitemapid;
  }
  const siteMapId = await createReturningId('sitemaps',
    { sitemapnameunique: SITEMAP_UNIQUE_NAME, sitemapxml: siteMapXml, isappaware: true },
    { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log(`  + sitemap ${SITEMAP_UNIQUE_NAME} created (${siteMapId})`);
  return siteMapId;
}

async function ensureAppIcon() {
  const existing = await findOne('webresourceset', `$select=webresourceid&$filter=name eq '${APP_ICON_WEB_RESOURCE}'`);
  if (existing) return existing.webresourceid;
  const iconId = await createReturningId('webresourceset', {
    name: APP_ICON_WEB_RESOURCE, displayname: 'Report Engine app icon',
    webresourcetype: WEB_RESOURCE_TYPE_SVG, content: Buffer.from(APP_ICON_SVG, 'utf8').toString('base64')
  }, { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log(`  + app icon ${APP_ICON_WEB_RESOURCE} created`);
  return iconId;
}

/* Retrieve cannot see an unpublished app, so a duplicate-name failure means a previous run created
   the app and died before publishing it. The id is unrecoverable through the Web API, so say so
   plainly rather than looping — deleting it needs the id logged by that earlier run. */
function recoverStrandedApp(error) {
  if (!String(error.message).includes(DUPLICATE_APP_NAME_ERROR)) throw error;
  throw new Error(
    `An app named "${APP_UNIQUE_NAME}" already exists but is UNPUBLISHED, so it is invisible to `
    + `retrieve while still blocking the name. Publish it (PublishXml with its appmoduleid, logged `
    + `by the run that created it) or DELETE appmodules(<that id>), then re-run.`);
}

async function createApp(iconWebResourceId) {
  // clienttype 4 = Unified Interface; navigationtype 0 = single-session; formfactor 1 = desktop.
  return createReturningId('appmodules', {
    name: APP_NAME, uniquename: APP_UNIQUE_NAME, description: APP_DESCRIPTION,
    clienttype: 4, navigationtype: 0, formfactor: 1, webresourceid: iconWebResourceId
  }, { 'MSCRM.SolutionUniqueName': SOLUTION }).catch(recoverStrandedApp);
}

async function ensureApp(iconWebResourceId) {
  const existing = await findOne('appmodules', `$select=appmoduleid&$filter=uniquename eq '${APP_UNIQUE_NAME}'`);
  if (existing) {
    await api('PATCH', `appmodules(${existing.appmoduleid})`, { name: APP_NAME, description: APP_DESCRIPTION });
    console.log(`  = app ${APP_UNIQUE_NAME} updated (${existing.appmoduleid})`);
    return existing.appmoduleid;
  }
  const appId = await createApp(iconWebResourceId);
  console.log(`  + app ${APP_UNIQUE_NAME} created (${appId}) — unpublished until this run publishes it`);
  return appId;
}

/** Only the sitemap is linked: web resources are not valid app components — behaviour note (5). */
async function linkSiteMap(appId, siteMapId) {
  await api('POST', 'AddAppComponents', {
    AppId: appId, Components: [{ '@odata.type': 'Microsoft.Dynamics.CRM.sitemap', sitemapid: siteMapId }]
  });
  console.log('  + sitemap linked to app');
}

async function publish(appId, siteMapId) {
  const parameterXml = `<importexportxml><appmodules><appmodule>${appId}</appmodule></appmodules>`
    + `<sitemaps><sitemap>${siteMapId}</sitemap></sitemaps></importexportxml>`;
  await api('POST', 'PublishXml', { ParameterXml: parameterXml });
  console.log('  ✓ app and sitemap published');
}

async function reportValidation(appId) {
  const response = await api('GET', `ValidateApp(AppModuleId=${appId})`);
  const result = response.AppValidationResponse || {};
  console.log(`  ValidateApp success=${result.ValidationSuccess}`);
  for (const issue of (result.ValidationIssueList || [])) {
    console.log(`    ${issue.ErrorType}: ${issue.Message || issue.DisplayName}`);
  }
}

/** Proves the app is really there — the create alone proves nothing, per behaviour note (1). */
async function confirmPublished(appId) {
  const found = await findOne('appmodules', `$select=appmoduleid,name,publishedon&$filter=appmoduleid eq ${appId}`);
  if (!found) throw new Error(`app ${appId} is still not retrievable after publish — it did not materialise`);
  console.log(`  ✓ confirmed retrievable: "${found.name}" published ${found.publishedon}`);
}

console.log(`\n== Provision "${APP_NAME}" app → ${baseUrl} ==\n`);
const siteMapId = await ensureSiteMap(await findDashboardId());
const appId = await ensureApp(await ensureAppIcon());
await linkSiteMap(appId, siteMapId);
await publish(appId, siteMapId);
await reportValidation(appId);
await confirmPublished(appId);

console.log(`\n✓ app id ${appId}`);
console.log(`✓ open: ${baseUrl}/main.aspx?appid=${appId}\n`);
