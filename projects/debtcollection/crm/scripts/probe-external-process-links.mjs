/**
 * probe-external-process-links.mjs — read-only inspection of the two same-organisation lookups on
 * qdb_collectionactivity (qdb_complaintcaseid → incident, qdb_legalrequestid → qdb_qdblegal)
 * before they are replaced by a generic external-process reference. Creates nothing.
 */
import { loadConfig, acquireToken } from './lib/crm-client.mjs';

const cfg = loadConfig();
const token = await acquireToken(cfg);
const H = { Authorization: 'Bearer ' + token, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'odata.include-annotations="*"' };
const get = async p => { const r = await fetch(cfg.apiBase + p, { headers: H }); const t = await r.text(); if (!r.ok) return { error: r.status + ' ' + t.slice(0, 300) }; return JSON.parse(t); };
const F = '@OData.Community.Display.V1.FormattedValue';
const ENTITY = "/EntityDefinitions(LogicalName='qdb_collectionactivity')";
const LOOKUPS = ['qdb_complaintcaseid', 'qdb_legalrequestid'];

console.log('=== qdb_collectionactivity custom columns');
const attrs = await get(ENTITY + '/Attributes?$select=LogicalName,AttributeType,DisplayName,RequiredLevel,MetadataId&$filter=IsCustomAttribute eq true');
for (const a of attrs.value.filter(a => a.AttributeType !== 'Virtual' && !/name$|yominame$/.test(a.LogicalName) || LOOKUPS.includes(a.LogicalName))) {
  console.log(' ', a.LogicalName, '|', a.AttributeType, '|', a.DisplayName?.UserLocalizedLabel?.Label, '|', a.RequiredLevel?.Value);
}

console.log('\n=== string columns with lengths (reuse candidates)');
const strings = await get(ENTITY + "/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=LogicalName,MaxLength,IsCustomAttribute");
console.log(strings.value.filter(s => s.IsCustomAttribute).map(s => s.LogicalName + '(' + s.MaxLength + ')').join(', '));

console.log('\n=== the two lookups');
for (const l of LOOKUPS) {
  const meta = await get(ENTITY + "/Attributes(LogicalName='" + l + "')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets,MetadataId,RequiredLevel");
  const count = await get('/qdb_collectionactivities?$select=activityid&$top=1&$count=true&$filter=_' + l + '_value ne null');
  console.log(' ', l, '→', JSON.stringify(meta.Targets ?? meta.error), '| rows with a value:', count['@odata.count'] ?? count.error);
  if (meta.MetadataId) {
    const deps = await get("/RetrieveDependenciesForDelete(ObjectId=" + meta.MetadataId + ",ComponentType=2)");
    const rows = deps.value ?? [];
    console.log('    dependencies blocking delete:', rows.length, rows.slice(0, 10).map(d => d.dependentcomponenttype + ':' + d.dependentcomponentobjectid).join(' '));
  }
}

console.log('\n=== activity types (the Type lookup) — does one type = one external process?');
const types = await get('/qdb_collectionactivitytypes?$select=qdb_code,qdb_name,qdb_isactive,qdb_category&$orderby=qdb_code');
for (const t of types.value ?? []) console.log(' ', t.qdb_code, '|', t.qdb_name, '|', t['qdb_category' + F] ?? '', '| active', t.qdb_isactive);

console.log('\n=== which activity types carry a value in each lookup');
for (const l of LOOKUPS) {
  const rows = await get('/qdb_collectionactivities?$select=_qdb_activitytypeid_value&$filter=_' + l + '_value ne null&$top=50');
  const byType = {};
  for (const r of rows.value ?? []) { const k = r['_qdb_activitytypeid_value' + F] ?? '(none)'; byType[k] = (byType[k] ?? 0) + 1; }
  console.log(' ', l, JSON.stringify(byType));
}

console.log('\n=== forms and views that mention the lookups');
const forms = await get("/systemforms?$select=name,type,formxml&$filter=objecttypecode eq 'qdb_collectionactivity'");
for (const f of forms.value ?? []) {
  const hits = LOOKUPS.filter(l => (f.formxml ?? '').includes(l));
  if (hits.length) console.log('  form', f.name, '(type', f.type + ')', hits.join(', '));
}
const views = await get("/savedqueries?$select=name,fetchxml,layoutxml&$filter=returnedtypecode eq 'qdb_collectionactivity'");
for (const v of views.value ?? []) {
  const hits = LOOKUPS.filter(l => ((v.fetchxml ?? '') + (v.layoutxml ?? '')).includes(l));
  if (hits.length) console.log('  view', v.name, hits.join(', '));
}

console.log('\n=== organisation / correlation columns already on the activity');
const orgLike = attrs.value.filter(a => /organi|source|origin|correlation|external|reference|target|system/i.test(a.LogicalName));
console.log(orgLike.map(a => a.LogicalName + ':' + a.AttributeType).join(', ') || 'none');

console.log('\n=== workflows / plugin steps on qdb_collectionactivity naming the lookups');
const steps = await get("/sdkmessageprocessingsteps?$select=name,filteringattributes&$filter=statecode eq 0&$expand=sdkmessagefilterid($select=primaryobjecttypecode)");
const actSteps = (steps.value ?? []).filter(s => s.sdkmessagefilterid?.primaryobjecttypecode === 'qdb_collectionactivity');
console.log(actSteps.map(s => s.name + ' [' + (s.filteringattributes || 'all') + ']').join('\n  ') || 'none');
const wfs = await get("/workflows?$select=name,xaml&$filter=primaryentity eq 'qdb_collectionactivity' and type eq 1");
console.log('workflows referencing:', (wfs.value ?? []).filter(w => LOOKUPS.some(l => (w.xaml ?? '').includes(l))).map(w => w.name).join(', ') || 'none');
