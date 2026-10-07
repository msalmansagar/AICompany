/**
 * export-dcp-solution.mjs — READ-ONLY. Exports the unmanaged qdb_debtcollection solution from the
 * cloud sandbox and records what it contains, as the source of the common on-prem package
 * (build-onprem-package.mjs turns it into the 9.1 kit).
 *
 *   onprem-deploy/<date>/source/qdb_debtcollection_cloud_unmanaged.zip
 *   onprem-deploy/<date>/source/component-inventory.json   every solution component, typed by name
 *
 * ExportSolution changes nothing in the organisation.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, acquireToken } from './lib/crm-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOLUTION = 'qdb_debtcollection';
const AUTHORISED_ORG = 'org5869857f';
const KIT_DATE = process.argv.find(a => a.startsWith('--date='))?.slice(7) ?? new Date().toISOString().slice(0, 10);
const OUT = resolve(HERE, `../../onprem-deploy/${KIT_DATE}/source`);

const cfg = loadConfig();
if (!cfg.orgUrl.includes(AUTHORISED_ORG)) { console.error(`Refusing: ${cfg.orgUrl} is not ${AUTHORISED_ORG}`); process.exit(1); }
const token = await acquireToken(cfg);
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };

async function call(method, path, body) {
  const response = await fetch(cfg.apiBase + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function componentTypeNames() {
  const definitions = (await call('GET', '/solutioncomponentdefinitions?$select=solutioncomponenttype,name,primaryentityname')).value;
  return new Map(definitions.map(d => [d.solutioncomponenttype, d.name ?? d.primaryentityname]));
}

async function inventory(solutionId, typeNames) {
  const rows = (await call('GET', `/solutioncomponents?$select=componenttype,objectid,rootcomponentbehavior&$filter=_solutionid_value eq ${solutionId}`)).value;
  const byType = {};
  for (const row of rows) {
    const name = typeNames.get(row.componenttype) ?? `unknown-${row.componenttype}`;
    byType[`${row.componenttype} ${name}`] = (byType[`${row.componenttype} ${name}`] ?? 0) + 1;
  }
  return { total: rows.length, byType, components: rows };
}

const solution = (await call('GET', `/solutions?$select=solutionid,version,ismanaged&$filter=uniquename eq '${SOLUTION}'&$expand=publisherid($select=uniquename,customizationprefix,customizationoptionvalueprefix)`)).value[0];
const organisation = (await call('GET', '/RetrieveVersion()')).Version;
const typeNames = await componentTypeNames();
const components = await inventory(solution.solutionid, typeNames);
const exported = await call('POST', '/ExportSolution', { SolutionName: SOLUTION, Managed: false });
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'qdb_debtcollection_cloud_unmanaged.zip'), Buffer.from(exported.ExportSolutionFile, 'base64'));
writeFileSync(resolve(OUT, 'component-inventory.json'), JSON.stringify({
  exportedAt: new Date().toISOString(), sourceOrganisation: cfg.orgUrl, sourceVersion: organisation,
  solution: { uniqueName: SOLUTION, version: solution.version, isManaged: solution.ismanaged, publisher: solution.publisherid },
  ...components,
}, null, 2));
console.log(`exported ${SOLUTION} ${solution.version} from ${organisation} — ${components.total} components`);
for (const [type, count] of Object.entries(components.byType).sort()) console.log(`  ${type}: ${count}`);
