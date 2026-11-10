/**
 * Live steps for the B8 UI: public views, charts, main forms and the Survey Engine app. Each step
 * creates what is missing and updates what exists to match ui-manifest.mjs, so re-runs converge.
 * Plan mode writes nothing.
 *
 * @module survey-provisioning/ui-steps
 */
import { buildViewPayload, buildChartPayload, buildFormXml, buildSiteMapXml, xml } from './ui-payloads.mjs';

const MAIN_FORM_TYPE = 2;
// The platform's default app icon web resource, present in every org.
const DEFAULT_APP_ICON = '953b9fac-1e5e-e611-80d6-00155ded156f';
const UNIFIED_INTERFACE = 4;
const PLAN_VIEW_ID = '{00000000-0000-0000-0000-000000000000}';

const quote = (text) => String(text).replace(/'/g, "''");
const first = async (client, path) => (await client.send('GET', path)).json.value[0];

async function tableMetadata(client, table) {
  return (await client.send('GET', `EntityDefinitions(LogicalName='${table}')?$select=MetadataId,ObjectTypeCode`)).json;
}

// returnedtypecode is an EntityName: the Web API reads and filters it as the logical name.
const findView = (client, view) =>
  first(client, `savedqueries?$select=savedqueryid&$filter=name eq '${quote(view.name)}' and returnedtypecode eq '${view.table}'`);

/** Creates each missing view and updates the content of each existing one. */
export async function ensureViews({ client, views, isApply, report }) {
  for (const view of views) {
    const payload = buildViewPayload(view, (await tableMetadata(client, view.table)).ObjectTypeCode);
    const existing = await findView(client, view);
    report(existing ? 'update' : 'create', `view ${view.table} "${view.name}"`);
    if (!isApply) continue;
    const id = existing ? existing.savedqueryid : (await client.send('POST', 'savedqueries', payload)).entityId;
    if (existing) await client.send('PATCH', `savedqueries(${id})`, { fetchxml: payload.fetchxml, layoutxml: payload.layoutxml, description: payload.description });
    if (view.isDefault) await makeDefault(client, { table: view.table, viewId: id });
  }
}

// Setting isdefault on one view does not clear it on the platform's "Active ..." view, so clear the others explicitly.
async function makeDefault(client, { table, viewId }) {
  const others = (await client.send('GET', `savedqueries?$select=savedqueryid&$filter=returnedtypecode eq '${table}' and querytype eq 0 and isdefault eq true and savedqueryid ne ${viewId}`)).json.value;
  for (const other of others) await client.send('PATCH', `savedqueries(${other.savedqueryid})`, { isdefault: false });
  await client.send('PATCH', `savedqueries(${viewId})`, { isdefault: true });
}

/** A lookup from (table, view name) to the saved query id; a view not created yet (plan mode) answers a placeholder. */
export async function readViewIds({ client, views }) {
  const ids = new Map();
  for (const view of views) ids.set(`${view.table}|${view.name}`, (await findView(client, view))?.savedqueryid ?? PLAN_VIEW_ID);
  return (table, name) => {
    const id = ids.get(`${table}|${name}`);
    if (!id) throw new Error(`No view "${name}" on ${table} in ui-manifest.mjs`);
    return id.startsWith('{') ? id : `{${id}}`;
  };
}

export async function ensureCharts({ client, charts, isApply, report }) {
  for (const chart of charts) {
    const payload = buildChartPayload(chart);
    const existing = await first(client, `savedqueryvisualizations?$select=savedqueryvisualizationid&$filter=name eq '${quote(chart.name)}' and primaryentitytypecode eq '${chart.table}'`);
    report(existing ? 'update' : 'create', `chart ${chart.table} "${chart.name}"`);
    if (!isApply) continue;
    // Content only: re-running must not undo a chart someone made the default.
    if (existing) await client.send('PATCH', `savedqueryvisualizations(${existing.savedqueryvisualizationid})`, { description: payload.description, datadescription: payload.datadescription, presentationdescription: payload.presentationdescription });
    else await client.send('POST', 'savedqueryvisualizations', payload);
  }
}

/** Replaces the layout of each table's main form (created with the table, so it is ours). */
export async function ensureForms({ client, forms, viewIdFor, isApply, report }) {
  for (const form of forms) {
    const existing = await first(client, `systemforms?$select=formid,name&$filter=objecttypecode eq '${form.table}' and type eq ${MAIN_FORM_TYPE}&$orderby=name asc`);
    if (!existing) throw new Error(`${form.table} has no main form to update`);
    report('update', `form ${form.table} "${existing.name}" (${form.tabs.length} tab(s))`);
    if (isApply) await client.send('PATCH', `systemforms(${existing.formid})`, { formxml: buildFormXml(form, viewIdFor) });
  }
}

const SVG_WEB_RESOURCE = 11;

/**
 * Gives each table its icon (Form Engine pattern): an SVG web resource, then IconVectorName on
 * the table, which needs the full definition PUT back. Publishes the icons; the tables are
 * published by publishTables.
 */
export async function ensureIcons({ client, icons, resourceNameFor, isApply, report }) {
  const resourceIds = [];
  for (const [table, icon] of Object.entries(icons)) {
    const name = resourceNameFor(table);
    resourceIds.push(await ensureSvgResource(client, { name, icon, isApply, report }));
    const definition = (await client.send('GET', `EntityDefinitions(LogicalName='${table}')`)).json;
    if (definition.IconVectorName === name) { report('exists', `icon on ${table}`); continue; }
    report('update', `icon on ${table} → ${name}`);
    if (isApply) await client.putMetadata(`EntityDefinitions(LogicalName='${table}')`, withoutAnnotations({ ...definition, IconVectorName: name }));
  }
  if (!isApply) return;
  const webresources = resourceIds.map((id) => `<webresource>{${id}}</webresource>`).join('');
  await client.send('POST', 'PublishXml', { ParameterXml: `<importexportxml><webresources>${webresources}</webresources></importexportxml>` });
}

async function ensureSvgResource(client, { name, icon, isApply, report }) {
  const payload = { name, displayname: `${icon.label} Icon`, webresourcetype: SVG_WEB_RESOURCE, content: Buffer.from(icon.svg, 'utf8').toString('base64') };
  const existing = await first(client, `webresourceset?$select=webresourceid&$filter=name eq '${name}'`);
  report(existing ? 'update' : 'create', `web resource ${name}`);
  if (!isApply) return existing?.webresourceid;
  if (existing) { await client.send('PATCH', `webresourceset(${existing.webresourceid})`, { content: payload.content, displayname: payload.displayname }); return existing.webresourceid; }
  return (await client.send('POST', 'webresourceset', payload)).entityId;
}

// A metadata PUT is refused while the body still carries OData annotations.
function withoutAnnotations(definition) {
  return Object.fromEntries(Object.entries(definition).filter(([key]) => !key.startsWith('@')));
}

export async function publishTables({ client, tables, isApply, report }) {
  report('publish', `${tables.length} tables (views, charts, forms)`);
  if (!isApply) return;
  const entities = tables.map((table) => `<entity>${xml(table)}</entity>`).join('');
  await client.send('POST', 'PublishXml', { ParameterXml: `<importexportxml><entities>${entities}</entities></importexportxml>` });
}

/** Ensures the sitemap and app, adds the tables, gives the app to the survey roles and publishes it. */
export async function ensureApp({ client, app, isApply, report }) {
  const sitemapId = await ensureSiteMap({ client, app, isApply, report });
  const existing = await findApp(client, app.uniqueName);
  report(existing ? 'exists' : 'create', `app "${app.name}" (${app.uniqueName}) with ${app.groups.flatMap((g) => g.tables).length} tables`);
  if (!isApply) return;
  const appId = existing?.appmoduleid ?? (await client.send('POST', 'appmodules', {
    name: app.name, uniquename: app.uniqueName, description: app.description, webresourceid: DEFAULT_APP_ICON, clienttype: UNIFIED_INTERFACE,
  })).entityId;
  await addComponents(client, { appId, sitemapId, tables: app.groups.flatMap((g) => g.tables) });
  // A new app cannot be read (or linked to roles) until it is published.
  await client.send('POST', 'PublishXml', { ParameterXml: `<importexportxml><appmodules><appmodule>${appId}</appmodule></appmodules><sitemaps><sitemap>${sitemapId}</sitemap></sitemaps></importexportxml>` });
  await grantAppToRoles(client, { appId, roleNames: app.roles, report });
}

// A created-but-unpublished app is invisible to a plain query, so look in the unpublished layer too.
async function findApp(client, uniqueName) {
  const filter = `$select=appmoduleid&$filter=uniquename eq '${uniqueName}'`;
  return (await first(client, `appmodules?${filter}`))
    ?? (await first(client, `appmodules/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()?${filter}`));
}

async function ensureSiteMap({ client, app, isApply, report }) {
  const sitemapxml = buildSiteMapXml(app);
  const existing = await first(client, `sitemaps?$select=sitemapid&$filter=sitemapnameunique eq '${app.uniqueName}'`);
  report(existing ? 'update' : 'create', `sitemap ${app.uniqueName} (${app.groups.map((g) => g.title).join(', ')})`);
  if (!isApply) return existing?.sitemapid ?? null;
  if (existing) { await client.send('PATCH', `sitemaps(${existing.sitemapid})`, { sitemapxml }); return existing.sitemapid; }
  return (await client.send('POST', 'sitemaps', { sitemapname: app.name, sitemapnameunique: app.uniqueName, sitemapxml })).entityId;
}

async function addComponents(client, { appId, sitemapId, tables }) {
  const entities = await Promise.all(tables.map(async (table) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.entity', entityid: (await tableMetadata(client, table)).MetadataId })));
  await client.send('POST', 'AddAppComponents', { AppId: appId, Components: [{ '@odata.type': 'Microsoft.Dynamics.CRM.sitemap', sitemapid: sitemapId }, ...entities] });
}

async function grantAppToRoles(client, { appId, roleNames, report }) {
  for (const roleName of roleNames) {
    const role = await first(client, `roles?$select=roleid&$filter=name eq '${quote(roleName)}' and _parentroleid_value eq null`);
    if (!role) { report('missing', `role ${roleName}; the app is not given to it`); continue; }
    const linked = await first(client, `appmodules(${appId})/appmoduleroles_association?$select=roleid&$filter=roleid eq ${role.roleid}`);
    if (!linked) await client.send('POST', `appmodules(${appId})/appmoduleroles_association/$ref`, { '@odata.id': `${client.orgUrl}/api/data/v9.2/roles(${role.roleid})` });
  }
}
