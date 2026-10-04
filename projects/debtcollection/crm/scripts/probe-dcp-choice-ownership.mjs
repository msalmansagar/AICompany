/**
 * probe-dcp-choice-ownership.mjs — READ-ONLY. For every global choice in the qdb_debtcollection
 * solution: which solutions contain it and which columns use it. A choice that another solution also
 * owns, or that a non-DCP table uses, is shared — shipping it would change QDB's component on import.
 */
import { loadConfig, acquireToken } from './lib/crm-client.mjs';

const SOLUTION = 'qdb_debtcollection';
const DCP_TABLES = new Set(['qdb_activityoutcome', 'qdb_assignmentconfiguration', 'qdb_collectionactivity', 'qdb_collectionactivitytype', 'qdb_collectioncase', 'qdb_collectionstrategy', 'qdb_communicationrun', 'qdb_communicationtemplate', 'qdb_delinquencysnapshot', 'qdb_identityexception', 'qdb_platformconfiguration', 'qdb_platformmapping', 'qdb_strategyaction']);
const cfg = loadConfig();
const token = await acquireToken(cfg);
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
const get = async path => { const r = await fetch(cfg.apiBase + path, { headers }); if (!r.ok) throw new Error(`${path} → ${r.status}`); return r.json(); };

const solution = (await get(`/solutions?$select=solutionid&$filter=uniquename eq '${SOLUTION}'`)).value[0];
const choiceIds = (await get(`/solutioncomponents?$select=objectid&$filter=_solutionid_value eq ${solution.solutionid} and componenttype eq 9`)).value.map(r => r.objectid);
const report = [];
for (const id of choiceIds) {
  const choice = await get(`/GlobalOptionSetDefinitions(${id})?$select=Name`);
  const solutions = (await get(`/solutioncomponents?$select=objectid&$filter=objectid eq ${id} and componenttype eq 9&$expand=solutionid($select=uniquename)`)).value.map(r => r.solutionid.uniquename).filter(n => n !== 'Default' && n !== 'Active');
  const dependents = (await get(`/RetrieveDependentComponents(ObjectId=${id},ComponentType=9)`)).value.filter(d => d.dependentcomponenttype === 2);
  const columns = [];
  for (const d of dependents) {
    const owner = (await get(`/EntityDefinitions?$select=LogicalName&$expand=Attributes($select=LogicalName;$filter=MetadataId eq ${d.dependentcomponentobjectid})`)).value;
    owner.forEach(e => (e.Attributes ?? []).forEach(a => columns.push(`${e.LogicalName}.${a.LogicalName}`)));
  }
  const foreignColumns = columns.filter(c => !DCP_TABLES.has(c.split('.')[0]));
  const otherSolutions = solutions.filter(n => n !== SOLUTION);
  report.push({ name: choice.Name, otherSolutions, columns, foreignColumns, isShared: otherSolutions.length > 0 || foreignColumns.length > 0 });
}
report.sort((a, b) => a.name.localeCompare(b.name));
for (const r of report) console.log(`${r.isShared ? 'SHARED' : 'dcp   '}  ${r.name}  columns=${r.columns.length}${r.otherSolutions.length ? `  other solutions: ${r.otherSolutions.join(',')}` : ''}${r.foreignColumns.length ? `  foreign columns: ${r.foreignColumns.join(',')}` : ''}`);
console.log(`\n${report.length} choices · shared: ${report.filter(r => r.isShared).length}`);
console.log(JSON.stringify(report.map(r => r.name)));
