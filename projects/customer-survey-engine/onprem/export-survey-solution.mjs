/**
 * READ-ONLY. Exports the unmanaged SurveyEngine solution from the cloud org, with an inventory
 * of its components, as the source of the on-prem kit (B9 item 3):
 *   onprem-deploy/<date>/source/SurveyEngine_cloud_unmanaged.zip
 *   onprem-deploy/<date>/source/component-inventory.json
 *
 *   node --env-file=<dfe>/scripts/.env onprem/export-survey-solution.mjs [--date=yyyy-MM-dd]
 *
 * ExportSolution changes nothing on the org. Refuses any org other than the authorised one.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createDataverseClient } from '../provisioning/lib/dataverse-client.mjs';
import { SOLUTION } from '../provisioning/manifest.mjs';

const AUTHORISED_ORG = 'org5869857f';
const HERE = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: { date: { type: 'string' } } });
const KIT_DATE = values.date ?? new Date().toISOString().slice(0, 10);
const OUT = resolve(HERE, `../onprem-deploy/${KIT_DATE}/source`);

async function componentTypeNames(client) {
  const definitions = (await client.send('GET', 'solutioncomponentdefinitions?$select=solutioncomponenttype,name,primaryentityname')).json.value;
  return new Map(definitions.map((d) => [d.solutioncomponenttype, d.name ?? d.primaryentityname]));
}

async function inventory(client, solutionId) {
  const typeNames = await componentTypeNames(client);
  const rows = (await client.send('GET', `solutioncomponents?$select=componenttype,objectid,rootcomponentbehavior&$filter=_solutionid_value eq ${solutionId}`)).json.value;
  const byType = {};
  for (const row of rows) {
    const key = `${row.componenttype} ${typeNames.get(row.componenttype) ?? 'unknown'}`;
    byType[key] = (byType[key] ?? 0) + 1;
  }
  return { total: rows.length, byType, components: rows };
}

async function run() {
  const client = await createDataverseClient({ solutionUniqueName: SOLUTION.uniqueName });
  if (!client.orgUrl.includes(AUTHORISED_ORG)) throw new Error(`Refusing: ${client.orgUrl} is not ${AUTHORISED_ORG}.`);
  const [solution] = (await client.send('GET', `solutions?$select=solutionid,version,ismanaged&$filter=uniquename eq '${SOLUTION.uniqueName}'`)).json.value;
  const sourceVersion = (await client.send('GET', 'RetrieveVersion()')).json.Version;
  const components = await inventory(client, solution.solutionid);
  const exported = (await client.sendOutsideSolution('POST', 'ExportSolution', { SolutionName: SOLUTION.uniqueName, Managed: false })).json;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, `${SOLUTION.uniqueName}_cloud_unmanaged.zip`), Buffer.from(exported.ExportSolutionFile, 'base64'));
  writeFileSync(resolve(OUT, 'component-inventory.json'), JSON.stringify({
    exportedAt: new Date().toISOString(), sourceOrganisation: client.orgUrl, sourceVersion,
    solution: { uniqueName: SOLUTION.uniqueName, version: solution.version, isManaged: solution.ismanaged }, ...components,
  }, null, 2));
  console.log(`exported ${SOLUTION.uniqueName} ${solution.version} from ${sourceVersion}: ${components.total} components`);
  Object.entries(components.byType).sort().forEach(([type, count]) => console.log(`  ${type}: ${count}`));
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
