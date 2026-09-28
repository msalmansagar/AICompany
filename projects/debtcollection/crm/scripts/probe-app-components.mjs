import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
const APP_ID = 'd3d594e6-13b4-f111-aaac-70a8a55bc6a5';
const cfg = loadConfig(); const token = await acquireToken(cfg);
const app = await apiGet(cfg, token, null, '/appmodules(' + APP_ID + ')?$select=name,uniquename,clienttype,webresourceid');
console.log('APP', app.name, app.uniquename);
const raw = await apiGet(cfg, token, null, '/RetrieveAppComponents(AppModuleId=' + APP_ID + ')');
console.log('RAW KEYS', Object.keys(raw), JSON.stringify(raw).slice(0, 300));
const unique = await apiGet(cfg, token, null, '/appmodules(' + APP_ID + ')?$select=appmoduleidunique');
const comps = await apiGet(cfg, token, null, '/appmodulecomponents?$select=componenttype,objectid&$filter=_appmoduleidunique_value eq ' + unique.appmoduleidunique);
const byType = {}; for (const c of comps.value) (byType[c.componenttype] ??= []).push(c.objectid);
console.log('COMPONENT TYPES', Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])));
const entities = [];
for (const id of byType[1] ?? []) {
  const e = await apiGet(cfg, token, null, "/EntityDefinitions(" + id + ")?$select=LogicalName,DisplayName,IconVectorName,IconSmallName,EntitySetName,PrimaryNameAttribute,IsActivity,OwnershipType");
  entities.push(e);
}
entities.sort((a, b) => a.LogicalName.localeCompare(b.LogicalName));
for (const e of entities) {
  const forms = await apiGet(cfg, token, null, "/systemforms?$select=formid,name,type,isdefault,formactivationstate&$filter=objecttypecode eq '" + e.LogicalName + "' and (type eq 2 or type eq 7)");
  const views = await apiGet(cfg, token, null, "/savedqueries?$select=savedqueryid,name,querytype,isdefault,isquickfindquery&$filter=returnedtypecode eq '" + e.LogicalName + "' and querytype eq 0");
  const attrs = await apiGet(cfg, token, null, "/EntityDefinitions(LogicalName='" + e.LogicalName + "')/Attributes?$select=LogicalName,AttributeType,IsCustomAttribute,IsValidForCreate,IsValidForUpdate,DisplayName&$filter=IsValidForUpdate eq true or IsValidForCreate eq true");
  const custom = attrs.value.filter(a => a.IsCustomAttribute && !/^qdb_.*id$/.test(a.LogicalName) || (a.IsCustomAttribute && a.AttributeType === 'Lookup'));
  console.log('\n' + e.LogicalName + ' | ' + (e.DisplayName?.UserLocalizedLabel?.Label ?? '') + ' | icon=' + (e.IconVectorName ?? '-') + ' | activity=' + e.IsActivity + ' | attrs(custom,writable)=' + custom.length);
  console.log('  forms: ' + forms.value.map(f => f.name + ' [type ' + f.type + ', default ' + f.isdefault + ', state ' + f.formactivationstate + ']').join(' ; '));
  console.log('  views: ' + views.value.map(v => v.name + (v.isdefault ? ' *' : '')).join(' ; '));
  console.log('  fields: ' + custom.map(a => a.LogicalName + ':' + a.AttributeType).join(', '));
}
