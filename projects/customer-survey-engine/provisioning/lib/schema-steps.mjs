/**
 * Schema steps: solution, tables, columns, relationships, alternate keys. Each step checks the
 * org first and only creates what is missing, so the provisioner can be re-run safely.
 * In plan mode (`isApply` false) nothing is written; the step only reports.
 *
 * @module survey-provisioning/schema-steps
 */
import { buildEntityPayload, buildAttributePayload, buildRelationshipPayload, buildAlternateKeyPayload } from './payloads.mjs';

const KEY_POLL_INTERVAL_MS = 5000;
const KEY_POLL_ATTEMPTS = 60;

const entityPath = (table) => `EntityDefinitions(LogicalName='${table}')`;
const attributePath = (table, column) => `${entityPath(table)}/Attributes(LogicalName='${column}')?$select=LogicalName`;

/**
 * Ensures the SurveyEngine solution exists under the org's qdb publisher.
 *
 * @param {{ client: object, solution: object, isApply: boolean, report: Function }} context
 */
export async function ensureSolution({ client, solution, isApply, report }) {
  const existing = await client.send('GET', `solutions?$select=solutionid,version&$filter=uniquename eq '${solution.uniqueName}'`);
  if (existing.json.value.length > 0) return report('exists', `solution ${solution.uniqueName} v${existing.json.value[0].version}`);

  const publishers = (await client.send('GET', `publishers?$select=publisherid,uniquename,customizationprefix&$filter=uniquename eq '${solution.publisherUniqueName}'`)).json.value;
  if (publishers.length !== 1) throw new Error(`Publisher '${solution.publisherUniqueName}' not found on this org`);
  if (publishers[0].customizationprefix !== 'qdb') throw new Error(`Publisher '${solution.publisherUniqueName}' has prefix '${publishers[0].customizationprefix}', expected 'qdb'`);
  report('create', `solution ${solution.uniqueName} (publisher ${publishers[0].uniquename})`);
  if (!isApply) return;
  await client.sendOutsideSolution('POST', 'solutions', {
    uniquename: solution.uniqueName, friendlyname: solution.friendlyName, version: solution.version,
    description: solution.description, 'publisherid@odata.bind': `/publishers(${publishers[0].publisherid})`,
  });
}

/**
 * Ensures each table and each of its columns exists.
 *
 * @param {{ client: object, tables: object[], languageCode: number, isApply: boolean, report: Function }} context
 */
export async function ensureTables(context) {
  for (const table of context.tables) {
    const isTablePresent = Boolean(await context.client.find(`${entityPath(table.name)}?$select=LogicalName`));
    if (isTablePresent) {
      context.report('exists', `table ${table.name}`);
      for (const column of table.columns) await ensureColumn(context, table, column);
    } else {
      await createTable(context, table);
    }
  }
}

async function createTable({ client, languageCode, isApply, report }, table) {
  report('create', `table ${table.name} with ${table.columns.length} columns`);
  if (isApply) await client.send('POST', 'EntityDefinitions', buildEntityPayload(table, languageCode));
}

// Only for a table that already exists: a column added to the manifest after the first run.
async function ensureColumn({ client, languageCode, isApply, report }, table, column) {
  if (await client.find(attributePath(table.name, column.name))) return report('exists', `column ${table.name}.${column.name}`, true);
  report('create', `column ${table.name}.${column.name} (${column.type})`);
  if (isApply) await client.send('POST', `${entityPath(table.name)}/Attributes`, buildAttributePayload(column, languageCode));
}

/**
 * Ensures each relationship (and so its lookup column) exists.
 *
 * @param {{ client: object, relationships: object[], languageCode: number, isApply: boolean, report: Function }} context
 */
export async function ensureRelationships({ client, relationships, languageCode, isApply, report }) {
  for (const relationship of relationships) {
    const name = `lookup ${relationship.from}.${relationship.lookup} -> ${relationship.to}`;
    const isFromPresent = isApply || await client.find(`${entityPath(relationship.from)}?$select=LogicalName`);
    if (isFromPresent && await client.find(attributePath(relationship.from, relationship.lookup))) { report('exists', name, true); continue; }
    report('create', `${name} (delete: ${relationship.cascade})`);
    if (isApply) await client.send('POST', 'RelationshipDefinitions', buildRelationshipPayload(relationship, languageCode));
  }
}

/**
 * Publishes the given tables so their new columns can be keyed and queried.
 *
 * @param {{ client: object, tableNames: string[], isApply: boolean, report: Function }} context
 */
export async function publishTables({ client, tableNames, isApply, report }) {
  report('publish', `${tableNames.length} tables`);
  if (!isApply) return;
  const entities = tableNames.map((name) => `<entity>${name}</entity>`).join('');
  await client.send('POST', 'PublishXml', { ParameterXml: `<importexportxml><entities>${entities}</entities></importexportxml>` });
}

/**
 * Ensures each alternate key exists and waits for its index job to finish: a key whose index
 * failed silently enforces nothing, which would let duplicate invitations through.
 *
 * @param {{ client: object, alternateKeys: object[], languageCode: number, isApply: boolean, report: Function }} context
 */
export async function ensureAlternateKeys({ client, alternateKeys, languageCode, isApply, report }) {
  for (const key of alternateKeys) {
    const keyPath = `${entityPath(key.table)}/Keys(LogicalName='${key.name}')?$select=EntityKeyIndexStatus`;
    const existing = await client.find(keyPath);
    if (existing) { report('exists', `key ${key.name} (${existing.EntityKeyIndexStatus})`); continue; }
    report('create', `key ${key.name} on ${key.table}(${key.columns.join(', ')})`);
    if (!isApply) continue;
    await client.send('POST', `${entityPath(key.table)}/Keys`, buildAlternateKeyPayload(key, languageCode));
    report('active', `key ${key.name}: ${await waitForKeyIndex(client, keyPath)}`);
  }
}

async function waitForKeyIndex(client, keyPath) {
  for (let attempt = 0; attempt < KEY_POLL_ATTEMPTS; attempt += 1) {
    const status = (await client.find(keyPath))?.EntityKeyIndexStatus;
    if (status === 'Active') return status;
    if (status === 'Failed') throw new Error(`Alternate key index failed: ${keyPath}`);
    await new Promise((resolve) => setTimeout(resolve, KEY_POLL_INTERVAL_MS));
  }
  throw new Error(`Alternate key index not active after ${(KEY_POLL_ATTEMPTS * KEY_POLL_INTERVAL_MS) / 1000}s: ${keyPath}`);
}
