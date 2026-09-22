// Independent read-back of the DCP schema on the sandbox: tables, column counts, activity flags,
// case status codes, option-set values the plugins depend on, roles, alternate key, field security.
// Run from crm/scripts so the client module resolves; env from the DFE .env (DV_* names).
import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';

const SOLUTION = 'msst_debtcollection';
const cfg = loadConfig();
const token = await acquireToken(cfg);
const get = (path) => apiGet(cfg, token, SOLUTION, path);

const all = await get('/EntityDefinitions?$select=LogicalName,IsActivity,HasNotes,HasActivities,OwnershipType');
const tables = all.value.filter(e => e.LogicalName.startsWith('msst_dcp')).sort((a, b) => a.LogicalName.localeCompare(b.LogicalName));
console.log('TABLES', tables.length);
for (const t of tables) {
  const attrs = await get(`/EntityDefinitions(LogicalName='${t.LogicalName}')/Attributes?$select=LogicalName&$filter=IsCustomAttribute eq true`);
  const custom = attrs.value.map(a => a.LogicalName).filter(n => n.startsWith('msst_'));
  console.log(`  ${t.LogicalName.padEnd(30)} activity=${t.IsActivity} notes=${t.HasNotes} hasActivities=${t.HasActivities} owner=${t.OwnershipType} customCols=${custom.length}`);
}

const status = await get("/EntityDefinitions(LogicalName='msst_dcpcollectioncase')/Attributes(LogicalName='statuscode')/Microsoft.Dynamics.CRM.StatusAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)");
console.log('CASE STATUSCODES');
for (const o of status.OptionSet.Options) console.log(`  ${o.Value} state=${o.State} ${o.Label.UserLocalizedLabel?.Label}`);

for (const name of ['msst_dcpactiontype', 'msst_dcpptpstatus', 'msst_dcpchannel', 'msst_dcpdpdbucket']) {
  const set = await get(`/GlobalOptionSetDefinitions(Name='${name}')?$select=Name&$expand=Options`).catch(() => null);
  const options = set?.Options ?? (await get(`/GlobalOptionSetDefinitions(Name='${name}')`))?.Options ?? [];
  console.log('OPTIONSET', name);
  for (const o of options) console.log(`  ${o.Value} ${o.Label.UserLocalizedLabel?.Label}`);
}

const ptp = await get("/EntityDefinitions(LogicalName='msst_dcpptprecord')/Attributes(LogicalName='statuscode')/Microsoft.Dynamics.CRM.StatusAttributeMetadata?$expand=OptionSet($select=Options)").catch(() => null);
if (ptp) { console.log('PTP STATUSCODES'); for (const o of ptp.OptionSet.Options) console.log(`  ${o.Value} state=${o.State} ${o.Label.UserLocalizedLabel?.Label}`); }

const keys = await get("/EntityDefinitions(LogicalName='msst_dcpcustomer')/Keys?$select=LogicalName,KeyAttributes,EntityKeyIndexStatus");
console.log('ALT KEYS', keys.value.map(k => `${k.LogicalName}[${k.KeyAttributes.join(',')}] ${k.EntityKeyIndexStatus}`).join(' | '));

const roles = await get("/roles?$select=name&$filter=startswith(name,'Msst DCP')&$orderby=name");
console.log('ROLES', roles.value.length, roles.value.map(r => r.name).join(' | '));

const profiles = await get("/fieldsecurityprofiles?$select=name&$filter=startswith(name,'Msst DCP')");
console.log('FIELD SECURITY PROFILES', profiles.value.map(p => p.name).join(' | '));
