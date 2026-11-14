/**
 * Schema steps: solution, tables, columns, relationships, alternate keys. Each step checks the
 * org first and only creates what is missing, so the provisioner can be re-run safely.
 * In plan mode (`isApply` false) nothing is written; the step only reports.
 *
 * @module survey-provisioning/schema-steps
 */
import { buildEntityPayload, buildAttributePayload, buildRelationshipPayload, buildAlternateKeyPayload, label } from './payloads.mjs';
import { createUntilPresent } from './create-until-present.mjs';

const KEY_POLL_INTERVAL_MS = 5000;
const KEY_POLL_ATTEMPTS = 60;

const entityPath = (table) => `EntityDefinitions(LogicalName='${table}')`;
const attributePath = (table, column) => `${entityPath(table)}/Attributes(LogicalName='${column}')?$select=LogicalName`;

/** POST through transient timeouts; `presencePath` is re-read before each retry so nothing is created twice. */
async function createMetadata({ client, report }, { path, payload, presencePath, subject }) {
  const outcome = await createUntilPresent({
    create: () => client.send('POST', path, payload),
    isPresent: async () => Boolean(await client.find(presencePath)),
    onRetry: (attempt, error) => report('retry', `${subject} (attempt ${attempt}: ${error.message.slice(0, 90)})`),
  });
  if (outcome !== 'created') report('present', `${subject} was committed despite the timeout`);
}

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

async function createTable(context, table) {
  const subject = `table ${table.name} with ${table.columns.length} columns`;
  context.report('create', subject);
  if (!context.isApply) return;
  await createMetadata(context, {
    path: 'EntityDefinitions', payload: buildEntityPayload(table, context.languageCode),
    presencePath: `${entityPath(table.name)}?$select=LogicalName`, subject,
  });
}

// Only for a table that already exists: a column added to the manifest after the first run.
async function ensureColumn(context, table, column) {
  const presencePath = attributePath(table.name, column.name);
  if (await context.client.find(presencePath)) {
    context.report('exists', `column ${table.name}.${column.name}`, true);
    if (column.type === 'picklist') await ensurePicklistOptions(context, table, column);
    return;
  }
  const subject = `column ${table.name}.${column.name} (${column.type})`;
  context.report('create', subject);
  if (!context.isApply) return;
  await createMetadata(context, {
    path: `${entityPath(table.name)}/Attributes`, payload: buildAttributePayload(column, context.languageCode), presencePath, subject,
  });
}

/** Adds manifest options missing from an existing choice column; existing options are never changed or removed. */
async function ensurePicklistOptions(context, table, column) {
  const path = `${entityPath(table.name)}/Attributes(LogicalName='${column.name}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`;
  const existingValues = new Set((await context.client.find(path)).OptionSet.Options.map((option) => option.Value));
  for (const option of (column.options ?? []).filter((o) => !existingValues.has(o.value))) {
    context.report('create', `option ${table.name}.${column.name} ${option.value} "${option.label}"`);
    if (!context.isApply) continue;
    await context.client.send('POST', 'InsertOptionValue', {
      EntityLogicalName: table.name, AttributeLogicalName: column.name, Value: option.value, Label: label(option.label, context.languageCode),
    });
  }
}

/**
 * Ensures each relationship (and so its lookup column) exists.
 *
 * @param {{ client: object, relationships: object[], languageCode: number, isApply: boolean, report: Function }} context
 */
export async function ensureRelationships(context) {
  for (const relationship of context.relationships) await ensureRelationship(context, relationship);
}

async function ensureRelationship(context, relationship) {
  const subject = `lookup ${relationship.from}.${relationship.lookup} -> ${relationship.to}`;
  const presencePath = attributePath(relationship.from, relationship.lookup);
  const isFromPresent = context.isApply || await context.client.find(`${entityPath(relationship.from)}?$select=LogicalName`);
  if (isFromPresent && await context.client.find(presencePath)) return context.report('exists', subject, true);
  context.report('create', `${subject} (delete: ${relationship.cascade})`);
  if (!context.isApply) return;
  await createMetadata(context, {
    path: 'RelationshipDefinitions', payload: buildRelationshipPayload(relationship, context.languageCode), presencePath, subject,
  });
}

/**
 * Turns change history on for each manifest table that asks for it (CEO 2026-11-14, audit AUD-01), publishes
 * and reads it back. Tables without isAuditEnabled are left exactly as they are. Runs after ensureTables
 * (step [2]), so every table it reads exists.
 *
 * @param {{ client: object, tables: object[], isApply: boolean, report: Function }} context
 */
export async function ensureTableAuditing(context) {
  const off = [];
  for (const table of context.tables.filter((t) => t.isAuditEnabled === true)) {
    const isOn = await isAuditOn(context.client, table.name);
    context.report(isOn ? 'exists' : 'enable', `auditing on table ${table.name}`);
    if (!isOn) off.push(table.name);
  }
  if (!context.isApply || off.length === 0) return;
  for (const name of off) await turnAuditingOn(context.client, name);
  await publishTables({ ...context, tableNames: off });
  for (const name of off) {
    if (!(await isAuditOn(context.client, name))) throw new Error(`Table ${name}: auditing still off after publishing`);
    context.report('verified', `auditing on table ${name}`);
  }
}

const isAuditOn = async (client, table) => (await client.send('GET', `${entityPath(table)}?$select=IsAuditEnabled`)).json.IsAuditEnabled.Value === true;

// Table metadata changes by writing the whole definition back (MergeLabels keeps other languages' labels).
async function turnAuditingOn(client, table) {
  const { '@odata.context': _context, ...definition } = (await client.send('GET', entityPath(table))).json;
  await client.putMetadata(entityPath(table), { ...definition, IsAuditEnabled: { ...definition.IsAuditEnabled, Value: true } });
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
export async function ensureAlternateKeys(context) {
  for (const key of context.alternateKeys) await ensureAlternateKey(context, key);
}

async function ensureAlternateKey(context, key) {
  const keyPath = `${entityPath(key.table)}/Keys(LogicalName='${key.name}')?$select=EntityKeyIndexStatus`;
  const existing = await context.client.find(keyPath);
  if (existing?.EntityKeyIndexStatus === 'Active') return context.report('exists', `key ${key.name} (Active)`);
  if (!existing) {
    const subject = `key ${key.name} on ${key.table}(${key.columns.join(', ')})`;
    context.report('create', subject);
    if (!context.isApply) return;
    await createMetadata(context, { path: `${entityPath(key.table)}/Keys`, payload: buildAlternateKeyPayload(key, context.languageCode), presencePath: keyPath, subject });
  } else {
    context.report('pending', `key ${key.name} (${existing.EntityKeyIndexStatus})`);
    if (!context.isApply) return;
  }
  context.report('active', `key ${key.name}: ${await waitForKeyIndex(context.client, keyPath)}`);
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
