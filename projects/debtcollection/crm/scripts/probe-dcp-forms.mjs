import { writeFileSync } from 'node:fs';
import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
const ENTITIES = ['qdb_activityoutcome','qdb_assignmentconfiguration','qdb_collectionactivity','qdb_collectionactivitytype','qdb_collectioncase','qdb_collectionstrategy','qdb_communicationrun','qdb_communicationtemplate','qdb_delinquencysnapshot','qdb_identityexception','qdb_platformconfiguration','qdb_platformmapping','qdb_strategyaction'];
const cfg = loadConfig(); const token = await acquireToken(cfg);
const out = {};
for (const e of ENTITIES) {
  const def = await apiGet(cfg, token, null, "/EntityDefinitions(LogicalName='" + e + "')?$select=LogicalName,DisplayName,PrimaryNameAttribute,PrimaryIdAttribute,IsActivity,OwnershipType,ObjectTypeCode");
  const attrs = await apiGet(cfg, token, null, "/EntityDefinitions(LogicalName='" + e + "')/Attributes?$select=LogicalName,AttributeType,AttributeTypeName,IsCustomAttribute,IsValidForCreate,IsValidForUpdate,IsValidForRead,DisplayName,RequiredLevel,IsPrimaryName,IsLogical,AttributeOf");
  const lookups = await apiGet(cfg, token, null, "/EntityDefinitions(LogicalName='" + e + "')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets");
  const forms = await apiGet(cfg, token, null, "/systemforms?$select=formid,name,formxml&$filter=objecttypecode eq '" + e + "' and type eq 2");
  const views = await apiGet(cfg, token, null, "/savedqueries?$select=savedqueryid,name,querytype,isdefault,fetchxml,layoutxml&$filter=returnedtypecode eq '" + e + "' and (querytype eq 0 or querytype eq 4)");
  out[e] = {
    def: { ...def, DisplayName: def.DisplayName?.UserLocalizedLabel?.Label },
    attrs: attrs.value.filter(a => a.IsValidForRead && !a.IsLogical && !a.AttributeOf).map(a => ({ name: a.LogicalName, type: a.AttributeTypeName?.Value ?? a.AttributeType, label: a.DisplayName?.UserLocalizedLabel?.Label ?? a.LogicalName, custom: a.IsCustomAttribute, create: a.IsValidForCreate, update: a.IsValidForUpdate, required: a.RequiredLevel?.Value, primary: a.IsPrimaryName })),
    lookups: Object.fromEntries(lookups.value.map(l => [l.LogicalName, l.Targets])),
    forms: forms.value, views: views.value,
  };
  console.log(e, 'attrs', out[e].attrs.length, 'forms', forms.value.length, 'views', views.value.map(v => v.name + '(' + v.querytype + (v.isdefault ? '*' : '') + ')').join(', '));
}
writeFileSync(process.env.PROBE_OUT, JSON.stringify(out, null, 1));
console.log('PLATFORM MAPPING FORMXML:\n' + out.qdb_platformmapping.forms[0].formxml.slice(0, 2500));
console.log('PLATFORM MAPPING VIEW LAYOUT:\n' + out.qdb_platformmapping.views.find(v => v.isdefault).layoutxml + '\n' + out.qdb_platformmapping.views.find(v => v.isdefault).fetchxml);
