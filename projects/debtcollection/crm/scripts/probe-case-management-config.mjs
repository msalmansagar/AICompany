/**
 * probe-case-management-config.mjs — read-only follow-up to probe-case-management.mjs: the
 * configuration records the HL complaint mapping depends on (case products, business units and
 * their managers, Non Customer account, case categories, DCP roles' Case privileges, the DCP
 * complaint linkage column). Creates nothing, changes nothing.
 */
import { loadConfig, acquireToken } from './lib/crm-client.mjs';

const cfg = loadConfig();
const token = await acquireToken(cfg);
const H = { Authorization: 'Bearer ' + token, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'odata.include-annotations="*"' };
const get = async p => { const r = await fetch(cfg.apiBase + p, { headers: H }); const t = await r.text(); if (!r.ok) return { error: r.status + ' ' + t.slice(0, 300) }; return JSON.parse(t); };
const F = '@OData.Community.Display.V1.FormattedValue';

console.log('=== qdb_case_products (target of incident.qdb_product)');
const cp = await get("/EntityDefinitions(LogicalName='qdb_case_products')?$select=EntitySetName,PrimaryNameAttribute,PrimaryIdAttribute");
console.log(cp.error ?? JSON.stringify(cp));
if (!cp.error) {
  const rows = await get('/' + cp.EntitySetName + '?$select=' + cp.PrimaryNameAttribute + ',' + cp.PrimaryIdAttribute + ',statecode,createdon&$orderby=' + cp.PrimaryNameAttribute);
  console.log('rows:', (rows.value ?? []).length);
  for (const r of rows.value ?? []) console.log(' ', r[cp.PrimaryIdAttribute], '|', r[cp.PrimaryNameAttribute], '|', r['statecode' + F]);
  const attrs = await get("/EntityDefinitions(LogicalName='qdb_case_products')/Attributes?$select=LogicalName,AttributeType&$filter=IsCustomAttribute eq true");
  console.log('custom attrs:', (attrs.value ?? []).map(a => a.LogicalName + ':' + a.AttributeType).join(', '));
}

console.log('\n=== businessunits (target of incident.qdb_department) with managers');
const bus = await get('/businessunits?$select=businessunitid,name,isdisabled,_parentbusinessunitid_value,_qdb_manager_value,_qdb_businessunithead_value&$orderby=name');
for (const b of bus.value ?? []) console.log(' ', b.businessunitid, '|', b.name, '| disabled', b.isdisabled, '| parent', b['_parentbusinessunitid_value' + F] ?? null, '| manager', b['_qdb_manager_value' + F] ?? null, '| head', b['_qdb_businessunithead_value' + F] ?? null);

console.log('\n=== accounts that could be the "Non Customer" placeholder');
const acc = await get("/accounts?$select=accountid,name,accountnumber,statecode,createdon&$filter=contains(name,'Non') or contains(name,'non') or contains(name,'Unknown') or contains(name,'Generic') or contains(name,'Placeholder') or contains(name,'Default')&$top=50");
console.log(JSON.stringify(acc.value ?? acc));
const accCount = await get('/accounts?$select=accountid&$top=1&$count=true');
console.log('accounts total:', accCount['@odata.count']);
const noCr = await get("/accounts?$select=accountid,name,accountnumber&$filter=accountnumber eq null and statecode eq 0&$top=20");
console.log('active accounts with no account number:', JSON.stringify((noCr.value ?? []).map(a => a.name)));

console.log('\n=== qdb_casecategory rows');
const cc = await get("/EntityDefinitions(LogicalName='qdb_casecategory')?$select=EntitySetName,PrimaryNameAttribute");
if (!cc.error) {
  const rows = await get('/' + cc.EntitySetName + '?$select=' + cc.PrimaryNameAttribute + '&$top=60&$orderby=' + cc.PrimaryNameAttribute);
  console.log((rows.value ?? []).map(r => r[cc.PrimaryNameAttribute]).join(' | '));
}

console.log('\n=== DCP / Collection roles and their Case privileges (KI-120 recheck)');
const roles = await get("/roles?$select=roleid,name&$filter=contains(name,'Collection') or contains(name,'DCP') or contains(name,'Debt')");
const privs = await get("/privileges?$select=privilegeid,name&$filter=name eq 'prvCreateIncident' or name eq 'prvReadIncident' or name eq 'prvWriteIncident' or name eq 'prvAppendToIncident' or name eq 'prvAppendIncident'");
const privIds = Object.fromEntries((privs.value ?? []).map(p => [p.privilegeid, p.name]));
for (const r of roles.value ?? []) {
  const rp = await get('/roles(' + r.roleid + ')/roleprivileges_association?$select=privilegeid,name');
  const held = (rp.value ?? []).filter(p => privIds[p.privilegeid]).map(p => p.name);
  console.log(' ', r.name, '→', held.length ? held.join(', ') : 'NO incident privileges');
}

console.log('\n=== DCP complaint linkage column');
const link = await get("/EntityDefinitions(LogicalName='qdb_collectionactivity')/Attributes(LogicalName='qdb_complaintcaseid')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets,RequiredLevel");
console.log(link.error ?? JSON.stringify({ targets: link.Targets, required: link.RequiredLevel?.Value }));
const linked = await get('/qdb_collectionactivities?$select=activityid&$filter=_qdb_complaintcaseid_value ne null&$top=1&$count=true');
console.log('activities already linked to a Case:', linked['@odata.count'] ?? linked.error);

console.log('\n=== incident: autonumber / title convention, SLA KPI instances, BPF instances');
const tn = await get("/EntityDefinitions(LogicalName='incident')/Attributes(LogicalName='ticketnumber')?$select=AutoNumberFormat,MaxLength");
console.log('ticketnumber format:', tn.AutoNumberFormat ?? '(platform default)');
const kpi = await get('/slakpiinstances?$select=slakpiinstanceid&$top=1&$count=true');
console.log('SLA KPI instances in org:', kpi['@odata.count'] ?? kpi.error);
const bpf = await get("/EntityDefinitions?$select=LogicalName&$filter=contains(LogicalName,'phonetocaseprocess') or contains(LogicalName,'casetoworkorder')");
console.log('BPF tables:', (bpf.value ?? []).map(e => e.LogicalName).join(', '));
