/**
 * Packages the Form Engine columns the surveys added (B0 Form Type, Addendum A scoring) for the
 * on-prem kit, as a CRM-produced solution rather than a hand-assembled one (CEO, 2026-11-11):
 * creates the temporary unmanaged solution QdbFormEngineSurveyUpdate holding only those columns,
 * exports it, then deletes the solution record. Deleting an unmanaged solution leaves its
 * components in place, so the org's tables and forms do not change.
 *
 *   node --env-file=<dfe>/scripts/.env onprem/export-form-engine-patch.mjs --date=yyyy-MM-dd [--apply]
 *
 * Plan mode (default) reads only. --apply is a live change: run it only with the user's go-ahead.
 * Output: onprem-deploy/<date>/form-engine/source/QdbFormEngineSurveyUpdate_cloud_unmanaged.zip
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createDataverseClient } from '../provisioning/lib/dataverse-client.mjs';
import { SOLUTION } from '../provisioning/manifest.mjs';
import { PATCH_COLUMNS } from './lib/form-engine-patch.mjs';

const PATCH_SOLUTION = 'QdbFormEngineSurveyUpdate';
const ATTRIBUTE_COMPONENT = 2;
const AUTHORISED_ORG = 'org5869857f';
const HERE = dirname(fileURLToPath(import.meta.url));

async function columnIds(client) {
  const ids = [];
  for (const [table, column] of PATCH_COLUMNS.map((name) => name.split('.'))) {
    const [attribute] = (await client.send('GET', `EntityDefinitions(LogicalName='${table}')/Attributes?$select=MetadataId&$filter=LogicalName eq '${column}'`)).json.value;
    if (!attribute) throw new Error(`${table}.${column} does not exist on this org`);
    ids.push({ table, column, metadataId: attribute.MetadataId });
  }
  return ids;
}

async function createPatchSolution(client) {
  const [publisher] = (await client.send('GET', `publishers?$select=publisherid&$filter=uniquename eq '${SOLUTION.publisherUniqueName}'`)).json.value;
  const { entityId } = await client.sendOutsideSolution('POST', 'solutions', {
    uniquename: PATCH_SOLUTION, friendlyname: 'Form Engine survey update (temporary)', version: '1.0.0.0',
    description: 'Temporary: carries the survey columns of the Form Engine for the on-prem kit. Deleted after export.',
    'publisherid@odata.bind': `/publishers(${publisher.publisherid})`,
  });
  return entityId;
}

async function addColumns(client, columns) {
  for (const { table, column, metadataId } of columns) {
    await client.sendOutsideSolution('POST', 'AddSolutionComponent', {
      ComponentId: metadataId, ComponentType: ATTRIBUTE_COMPONENT, SolutionUniqueName: PATCH_SOLUTION, AddRequiredComponents: false,
    });
    console.log(`  added ${table}.${column}`);
  }
}

async function exportPatch(client, outDir) {
  const exported = (await client.sendOutsideSolution('POST', 'ExportSolution', { SolutionName: PATCH_SOLUTION, Managed: false })).json;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, `${PATCH_SOLUTION}_cloud_unmanaged.zip`), Buffer.from(exported.ExportSolutionFile, 'base64'));
}

async function run() {
  const { values } = parseArgs({ options: { date: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  if (!values.date) throw new Error('--date=yyyy-MM-dd is required.');
  const client = await createDataverseClient({ solutionUniqueName: PATCH_SOLUTION });
  if (!client.orgUrl.includes(AUTHORISED_ORG)) throw new Error(`Refusing: ${client.orgUrl} is not ${AUTHORISED_ORG}.`);
  const columns = await columnIds(client);
  const [existing] = (await client.send('GET', `solutions?$select=solutionid&$filter=uniquename eq '${PATCH_SOLUTION}'`)).json.value;
  if (existing) throw new Error(`${PATCH_SOLUTION} already exists (${existing.solutionid}); a previous run did not finish. Inspect and delete it first.`);
  console.log(`${values.apply ? 'APPLY' : 'PLAN (no changes)'}: create ${PATCH_SOLUTION}, add ${columns.length} columns, export, delete the solution record`);
  if (!values.apply) return;
  const solutionId = await createPatchSolution(client);
  try {
    await addColumns(client, columns);
    await exportPatch(client, resolve(HERE, `../onprem-deploy/${values.date}/form-engine/source`));
    console.log('  exported');
  } finally {
    await client.sendOutsideSolution('DELETE', `solutions(${solutionId})`);
    console.log(`  deleted the temporary solution ${PATCH_SOLUTION}`);
  }
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
