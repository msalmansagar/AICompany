/**
 * make-solution-portable.mjs — makes the qdb_debtcollection solution importable into BOTH HL CRM
 * and BFD CRM (docs/ExternalProcessReference.md).
 *
 * The model-driven app "Debt Collection" (qdb_CollectionWorkspace) listed QDB tables DCP does not
 * own, which pulled them into the DCP solution:
 *   incident, qdb_qdblegal  — BFD CRM's Case Management and Legal; they do not exist in HL CRM and
 *                             must never be copied there or overwritten in BFD CRM;
 *   systemuser, team        — platform tables whose customisations belong to each organisation.
 *
 * This script, sandbox only:
 *   1. removes incident and qdb_qdblegal from the app's site map and from the app;
 *   2. removes all four tables from the DCP solution (RemoveSolutionComponent — unlinks only; the
 *      tables, their data and their customisations stay exactly as they are in the organisation).
 * Deletes nothing. --dry-run reports and writes nothing. Publishes the app and site map at the end.
 */
import { loadConfig, acquireToken, apiGet, apiPost } from './lib/crm-client.mjs';

const SOLUTION = 'qdb_debtcollection';
const APP = 'qdb_CollectionWorkspace';
const AUTHORISED_ORG = 'org5869857f';
const NOT_IN_APP = ['incident', 'qdb_qdblegal'];
const NOT_IN_SOLUTION = ['incident', 'qdb_qdblegal', 'systemuser', 'team'];
const ENTITY_COMPONENT = 1;
const SITEMAP_COMPONENT = 62;
const isDryRun = process.argv.includes('--dry-run');

const cfg = loadConfig();
if (!cfg.orgUrl.includes(AUTHORISED_ORG)) { console.error(`Refusing: ${cfg.orgUrl} is not ${AUTHORISED_ORG}`); process.exit(1); }
const token = await acquireToken(cfg);
const get = path => apiGet(cfg, token, null, path);

async function metadataIdOf(logicalName) {
  const definition = await get(`/EntityDefinitions(LogicalName='${logicalName}')?$select=MetadataId`);
  return definition.MetadataId;
}

async function loadApp() {
  const apps = await get(`/appmodules?$select=appmoduleid,appmoduleidunique&$filter=uniquename eq '${APP}'`);
  if (apps.value.length !== 1) throw new Error(`app ${APP} not found`);
  return apps.value[0];
}

/** Drops every SubArea that opens one of the removed tables; everything else is kept byte for byte. */
async function pruneSiteMap(app) {
  const components = await get(`/appmodulecomponents?$select=objectid&$filter=_appmoduleidunique_value eq ${app.appmoduleidunique} and componenttype eq ${SITEMAP_COMPONENT}`);
  for (const component of components.value) {
    const siteMap = await get(`/sitemaps(${component.objectid})?$select=sitemapxml,sitemapnameunique`);
    const pattern = new RegExp(`<SubArea\\b[^>]*\\bEntity="(?:${NOT_IN_APP.join('|')})"[^>]*?(?:/>|>[\\s\\S]*?</SubArea>)`, 'g');
    const removed = siteMap.sitemapxml.match(pattern) ?? [];
    console.log(`  site map ${siteMap.sitemapnameunique}: ${removed.length} entry(ies) for ${NOT_IN_APP.join(', ')}`);
    if (removed.length === 0 || isDryRun) continue;
    await patch(`/sitemaps(${component.objectid})`, { sitemapxml: siteMap.sitemapxml.replace(pattern, '') });
  }
}

async function removeFromApp(app) {
  const inApp = await get(`/appmodulecomponents?$select=objectid&$filter=_appmoduleidunique_value eq ${app.appmoduleidunique} and componenttype eq ${ENTITY_COMPONENT}`);
  const present = new Set(inApp.value.map(component => component.objectid));
  const components = [];
  for (const logicalName of NOT_IN_APP) {
    const entityId = await metadataIdOf(logicalName);
    if (present.has(entityId)) components.push({ '@odata.type': 'Microsoft.Dynamics.CRM.entity', entityid: entityId });
  }
  console.log(`  app: ${components.length} of ${NOT_IN_APP.length} table(s) still to remove`);
  if (!isDryRun && components.length > 0) await apiPost(cfg, token, null, '/RemoveAppComponents', { AppId: app.appmoduleid, Components: components });
}

/** Unlinks each table from the solution through its solution-component record; the table itself is untouched. */
async function removeFromSolution() {
  const solution = await get(`/solutions?$select=solutionid&$filter=uniquename eq '${SOLUTION}'`);
  for (const logicalName of NOT_IN_SOLUTION) {
    const objectId = await metadataIdOf(logicalName);
    const linked = await get(`/solutioncomponents?$select=solutioncomponentid&$filter=_solutionid_value eq ${solution.value[0].solutionid} and objectid eq ${objectId} and componenttype eq ${ENTITY_COMPONENT}`);
    if (linked.value.length === 0) { console.log(`  solution: ${logicalName} not linked`); continue; }
    console.log(`  solution: unlink ${logicalName}`);
    if (isDryRun) continue;
    await apiPost(cfg, token, null, '/RemoveSolutionComponent', {
      // The platform reads this reference's id as the component's own id — the table's MetadataId.
      SolutionComponent: { '@odata.type': 'Microsoft.Dynamics.CRM.solutioncomponent', solutioncomponentid: objectId },
      ComponentType: ENTITY_COMPONENT, SolutionUniqueName: SOLUTION,
    });
  }
}

async function patch(path, body) {
  const response = await fetch(`${cfg.apiBase}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'MSCRM.SolutionUniqueName': SOLUTION },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`PATCH ${path} → ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

const app = await loadApp();
await pruneSiteMap(app);
await removeFromApp(app);
await removeFromSolution();
if (!isDryRun) {
  const siteMaps = await get(`/appmodulecomponents?$select=objectid&$filter=_appmoduleidunique_value eq ${app.appmoduleidunique} and componenttype eq ${SITEMAP_COMPONENT}`);
  const siteMapXml = siteMaps.value.map(component => `<sitemap>${component.objectid}</sitemap>`).join('');
  await apiPost(cfg, token, null, '/PublishXml', { ParameterXml: `<importexportxml><appmodules><appmodule>${app.appmoduleid}</appmodule></appmodules><sitemaps>${siteMapXml}</sitemaps></importexportxml>` });
  console.log('  [PUBLISHED] app and site map');
}
