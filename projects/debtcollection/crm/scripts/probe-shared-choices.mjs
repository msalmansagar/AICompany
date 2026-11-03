/**
 * probe-shared-choices.mjs — read-only assessment of the five DCP columns that use QDB-wide global
 * choices (approval status, risk level, priority): column definitions, the choices' options,
 * owning solutions and publishers, every other attribute bound to the same choice, and what depends
 * on each column. Creates nothing, changes nothing.
 */
import { loadConfig, acquireToken } from './lib/crm-client.mjs';

const cfg = loadConfig();
const token = await acquireToken(cfg);
const H = { Authorization: 'Bearer ' + token, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
const get = async p => { const r = await fetch(cfg.apiBase + p, { headers: H }); const t = await r.text(); return r.ok ? JSON.parse(t) : { error: r.status + ' ' + t.slice(0, 200) }; };
const label = l => l?.UserLocalizedLabel?.Label;

const COLUMNS = [
  ['qdb_collectionactivity', 'qdb_approvalstatus', 'qdb_collectionactivities'],
  ['qdb_communicationtemplate', 'qdb_approvalstatus', 'qdb_communicationtemplates'],
  ['qdb_assignmentconfiguration', 'qdb_risklevel', 'qdb_assignmentconfigurations'],
  ['qdb_collectionstrategy', 'qdb_risklevel', 'qdb_collectionstrategies'],
  ['qdb_collectioncase', 'qdb_priority', 'qdb_collectioncases'],
];
const COMPONENT_NAMES = { 1: 'Entity', 2: 'Attribute', 9: 'OptionSet', 26: 'SavedQuery(view)', 60: 'SystemForm', 61: 'WebResource', 80: 'AppModule', 62: 'SiteMap', 29: 'Workflow', 92: 'PluginStep' };

async function solutionsOf(objectId, componentType) {
  const rows = await get(`/solutioncomponents?$select=_solutionid_value&$filter=objectid eq ${objectId} and componenttype eq ${componentType}&$expand=solutionid($select=uniquename,ismanaged,version;$expand=publisherid($select=uniquename,customizationprefix,customizationoptionvalueprefix))`);
  return (rows.value ?? []).map(r => `${r.solutionid?.uniquename}${r.solutionid?.ismanaged ? ' (managed)' : ''} · publisher ${r.solutionid?.publisherid?.uniquename} (${r.solutionid?.publisherid?.customizationoptionvalueprefix})`);
}

const choices = new Map();
for (const [entity, column, set] of COLUMNS) {
  const a = await get(`/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${column}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName,MetadataId,RequiredLevel,DefaultFormValue,DisplayName,Description,IsCustomizable&$expand=GlobalOptionSet($select=Name,MetadataId,IsManaged)`);
  if (a.error) { console.log(`\n### ${entity}.${column} — ${a.error}`); continue; }
  const data = await get(`/${set}?$select=${column}&$filter=${column} ne null&$top=1&$count=true`);
  const total = await get(`/${set}?$select=createdon&$top=1&$count=true`);
  const deps = await get(`/RetrieveDependenciesForDelete(ObjectId=${a.MetadataId},ComponentType=2)`);
  console.log(`\n### ${entity}.${column}`);
  console.log(`  display "${label(a.DisplayName)}" · required ${a.RequiredLevel?.Value} · default ${a.DefaultFormValue} · global choice ${a.GlobalOptionSet?.Name} (managed ${a.GlobalOptionSet?.IsManaged})`);
  console.log(`  rows with a value: ${data['@odata.count']} of ${total['@odata.count']}`);
  console.log(`  column in solutions: ${(await solutionsOf(a.MetadataId, 2)).join('; ') || '(none listed)'}`);
  console.log(`  depends on the column: ${(deps.value ?? []).map(d => `${COMPONENT_NAMES[d.dependentcomponenttype] ?? d.dependentcomponenttype}:${d.dependentcomponentobjectid}`).join(', ') || 'nothing'}`);
  choices.set(a.GlobalOptionSet?.Name, a.GlobalOptionSet?.MetadataId);
}

console.log('\n=== the global choices');
for (const [name, id] of choices) {
  const o = await get(`/GlobalOptionSetDefinitions(Name='${name}')`);
  console.log(`\n${name}: ${(o.Options ?? []).map(x => `${x.Value}=${label(x.Label)}`).join(' | ')}`);
  console.log(`  managed ${o.IsManaged} · in solutions: ${(await solutionsOf(id, 9)).join('; ') || '(none listed)'}`);
  const users = await get(`/RetrieveDependentComponents(ObjectId=${id},ComponentType=9)`);
  const attrIds = (users.value ?? []).filter(d => d.dependentcomponenttype === 2).map(d => d.dependentcomponentobjectid);
  const names = [];
  for (const attrId of attrIds) {
    const m = await get(`/EntityDefinitions?$select=LogicalName&$expand=Attributes($select=LogicalName;$filter=MetadataId eq ${attrId})`);
    for (const e of m.value ?? []) for (const at of e.Attributes ?? []) names.push(`${e.LogicalName}.${at.LogicalName}`);
  }
  console.log(`  columns bound to it (${attrIds.length}): ${names.join(', ') || attrIds.join(', ')}`);
}

console.log('\n=== forms and views mentioning the five columns');
for (const [entity, column] of COLUMNS) {
  const forms = await get(`/systemforms?$select=name&$filter=objecttypecode eq '${entity}' and contains(formxml,'${column}')`);
  const views = await get(`/savedqueries?$select=name&$filter=returnedtypecode eq '${entity}' and (contains(fetchxml,'${column}') or contains(layoutxml,'${column}'))`);
  console.log(`${entity}.${column}: forms [${(forms.value ?? []).map(f => f.name).join(', ')}] · views [${(views.value ?? []).map(v => v.name).join(', ')}]${forms.error ? ' ' + forms.error : ''}`);
}
