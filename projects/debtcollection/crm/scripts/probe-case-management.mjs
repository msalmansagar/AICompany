/**
 * probe-case-management.mjs — read-only inspection of QDB's Case Management (`incident`) for the
 * HL complaint integration: field metadata, configuration records, real HL rows, automation.
 * Creates nothing, changes nothing.
 */
import { loadConfig, acquireToken } from './lib/crm-client.mjs';

const cfg = loadConfig();
const token = await acquireToken(cfg);
const H = { Authorization: 'Bearer ' + token, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'odata.include-annotations="*"' };
const get = async p => { const r = await fetch(cfg.apiBase + p, { headers: H }); const t = await r.text(); if (!r.ok) return { error: r.status + ' ' + t.slice(0, 200) }; return JSON.parse(t); };
const F = '@OData.Community.Display.V1.FormattedValue';
const E = "/EntityDefinitions(LogicalName='incident')/Attributes(LogicalName='";

const fields = ['qdb_assigned_to_user', 'qdb_businessunit', 'qdb_department', 'qdb_case_source', 'casetypecode', 'qdb_contact_name', 'customerid', 'qdb_customer_mobile_number', 'qdb_customer_name', 'description', 'qdb_existing_customer', 'caseorigincode', 'ownerid', 'qdb_product', 'followupby', 'ticketnumber', 'title', 'qdb_case_category', 'qdb_category', 'qdb_subject', 'qdb_requesttype', 'prioritycode'];
console.log('=== incident attributes');
for (const f of fields) {
  const a = await get(E + f + "')?$select=LogicalName,AttributeType,RequiredLevel,DisplayName,IsValidForCreate");
  if (a.error) { console.log(f, 'ERROR', a.error); continue; }
  let extra = '';
  if (['Lookup', 'Customer', 'Owner'].includes(a.AttributeType)) { const l = await get(E + f + "')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets"); extra = ' targets=' + JSON.stringify(l.Targets); }
  if (a.AttributeType === 'Picklist') { const o = await get(E + f + "')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)"); extra = ' options=' + (o.OptionSet?.Options ?? []).map(x => x.Value + ':' + x.Label?.UserLocalizedLabel?.Label).join(' | '); }
  if (a.AttributeType === 'Boolean') { const o = await get(E + f + "')/Microsoft.Dynamics.CRM.BooleanAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=TrueOption,FalseOption)"); extra = ' true(1)=' + o.OptionSet?.TrueOption?.Label?.UserLocalizedLabel?.Label + ' false(0)=' + o.OptionSet?.FalseOption?.Label?.UserLocalizedLabel?.Label; }
  console.log(f, '|', a.AttributeType, '|', a.RequiredLevel?.Value, '|', a.DisplayName?.UserLocalizedLabel?.Label, '| create', a.IsValidForCreate, extra);
}

console.log('\n=== incident attributes required on create');
const req = await get("/EntityDefinitions(LogicalName='incident')/Attributes?$select=LogicalName,RequiredLevel,IsValidForCreate");
console.log(req.value.filter(a => a.IsValidForCreate && a.RequiredLevel?.Value !== 'None' && a.RequiredLevel?.Value !== 'Recommended').map(a => a.LogicalName + ':' + a.RequiredLevel.Value).join(', '));

console.log('\n=== Non Customer accounts');
const nc = await get("/accounts?$select=accountid,name,accountnumber,statecode,createdon,telephone1&$filter=contains(name,'Non Customer') or contains(name,'NonCustomer') or contains(name,'Non-Customer')");
console.log(JSON.stringify(nc.value ?? nc));

console.log('\n=== Housing Loan products');
const pr = await get("/products?$select=productid,name,productnumber,statecode&$filter=contains(name,'Housing')");
console.log(JSON.stringify(pr.value ?? pr));

console.log('\n=== qdb_department target and Housing Loan rows');
const dep = await get(E + "qdb_department')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets");
console.log('department targets', JSON.stringify(dep.Targets));
for (const t of dep.Targets ?? []) {
  const d = await get("/EntityDefinitions(LogicalName='" + t + "')?$select=EntitySetName,PrimaryNameAttribute");
  const attrs = await get("/EntityDefinitions(LogicalName='" + t + "')/Attributes?$select=LogicalName,AttributeType");
  console.log(t, d.EntitySetName, '| attrs (manager/head/bu/user):', attrs.value.filter(a => /manager|head|businessunit|_bu|user/i.test(a.LogicalName)).map(a => a.LogicalName + ':' + a.AttributeType).join(', '));
  const rows = await get('/' + d.EntitySetName + "?$select=" + d.PrimaryNameAttribute + ',' + t + "id&$filter=contains(" + d.PrimaryNameAttribute + ",'Housing')");
  console.log('Housing rows:', JSON.stringify(rows.value ?? rows).slice(0, 800));
}

console.log('\n=== qdb_businessunit option set (if picklist) / or lookup target');
const bu = await get(E + "qdb_businessunit')?$select=AttributeType");
if (bu.AttributeType === 'Lookup') {
  const l = await get(E + "qdb_businessunit')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets");
  for (const t of l.Targets ?? []) {
    const d = await get("/EntityDefinitions(LogicalName='" + t + "')?$select=EntitySetName,PrimaryNameAttribute");
    const attrs = await get("/EntityDefinitions(LogicalName='" + t + "')/Attributes?$select=LogicalName,AttributeType");
    console.log(t, d.EntitySetName, '| attrs:', attrs.value.filter(a => /manager|head|user/i.test(a.LogicalName)).map(a => a.LogicalName + ':' + a.AttributeType).join(', '));
    const rows = await get('/' + d.EntitySetName + "?$select=" + d.PrimaryNameAttribute + "&$filter=contains(" + d.PrimaryNameAttribute + ",'Housing')");
    console.log('Housing rows:', JSON.stringify(rows.value ?? rows).slice(0, 800));
  }
}

console.log('\n=== existing incidents with a business unit (read-only, newest 8)');
const inc = await get("/incidents?$select=ticketnumber,title,casetypecode,caseorigincode,qdb_case_source,qdb_existing_customer,qdb_businessunit,qdb_contact_name,qdb_customer_name,qdb_customer_mobile_number,followupby,createdon,_customerid_value,_qdb_department_value,_qdb_product_value,_qdb_assigned_to_user_value,_ownerid_value&$orderby=createdon desc&$top=8");
for (const r of inc.value ?? []) console.log(JSON.stringify({ n: r.ticketnumber, title: r.title, type: r['casetypecode' + F], origin: r['caseorigincode' + F], src: r['qdb_case_source' + F], existing: r['qdb_existing_customer' + F], bu: r['qdb_businessunit' + F] ?? r['_qdb_businessunit_value' + F], contact: r.qdb_contact_name, custname: r.qdb_customer_name, mobile: r.qdb_customer_mobile_number, followupby: r.followupby, created: r.createdon, customer: r['_customerid_value' + F], dept: r['_qdb_department_value' + F], product: r['_qdb_product_value' + F], assigned: r['_qdb_assigned_to_user_value' + F], owner: r['_ownerid_value' + F] }));
const count = await get('/incidents?$select=incidentid&$top=1&$count=true');
console.log('incident rows:', count['@odata.count']);

console.log('\n=== incident automation (read-only)');
const steps = await get("/sdkmessageprocessingsteps?$select=name,stage,mode,statecode,filteringattributes&$filter=statecode eq 0&$expand=sdkmessagefilterid($select=primaryobjecttypecode),sdkmessageid($select=name)");
console.log('plugin steps on incident:', (steps.value ?? []).filter(s => s.sdkmessagefilterid?.primaryobjecttypecode === 'incident').map(s => s.sdkmessageid?.name + '/' + s.stage + '/' + s.mode + ' ' + s.name).join(' ; ') || 'none');
const wf = await get("/workflows?$select=name,category,type,statecode,mode,triggeroncreate,triggeronupdateattributelist,primaryentity&$filter=primaryentity eq 'incident' and type eq 1 and statecode eq 1");
console.log('active processes on incident:', (wf.value ?? []).map(w => '[cat' + w.category + '] ' + w.name + (w.triggeroncreate ? ' (onCreate)' : '') + (w.triggeronupdateattributelist ? ' (onUpdate:' + w.triggeronupdateattributelist + ')' : '')).join(' ; ') || 'none');
const sla = await get("/slas?$select=name,objecttypecode,statecode,isdefault&$filter=statecode eq 1");
console.log('active SLAs:', JSON.stringify((sla.value ?? []).map(s => s.name + ':' + s.objecttypecode + (s.isdefault ? '*' : ''))));
const capis = await get("/customapis?$select=uniquename,displayname,boundentitylogicalname&$filter=contains(uniquename,'Case') or contains(uniquename,'Complaint') or contains(uniquename,'dcp')");
console.log('custom APIs (case/complaint/dcp):', JSON.stringify((capis.value ?? []).map(c => c.uniquename)));
