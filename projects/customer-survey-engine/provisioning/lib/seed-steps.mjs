/**
 * Seed configuration rows (FR-CSE-005, section 13.2 step 4). Seeds are per-org data files:
 * a row is created only when missing and never overwritten, so an admin's later edits survive
 * a re-run. A row carrying a TO_CONFIRM value is skipped and reported, never guessed.
 *
 * @module survey-provisioning/seed-steps
 */

export const TO_CONFIRM = 'TO_CONFIRM';

/**
 * Lists the fields of a seed row still marked TO_CONFIRM.
 *
 * @param {Record<string, unknown>} row
 * @returns {string[]}
 */
export function unconfirmedFields(row) {
  return Object.entries(row).filter(([, value]) => value === TO_CONFIRM).map(([field]) => field);
}

/**
 * @param {{ client: object, seed: object, isApply: boolean, report: Function }} context
 */
export async function ensureSeedRows(context) {
  const sourceSet = await findEntitySet(context.client, 'qdb_survey_source');
  for (const source of context.seed.sources) await ensureSource(context, sourceSet, source);
  await ensureSingleton(context, 'qdb_survey_settings', context.seed.settings);
  for (const smsConfig of context.seed.smsConfigs ?? []) await ensureSingleton(context, 'qdb_survey_sms_config', smsConfig);
}

// Dataverse picks each table's plural entity-set name, so it is read, never guessed.
async function findEntitySet(client, logicalName) {
  return (await client.find(`EntityDefinitions(LogicalName='${logicalName}')?$select=EntitySetName`))?.EntitySetName ?? null;
}

async function ensureSource({ client, isApply, report }, entitySet, source) {
  const pending = unconfirmedFields(source);
  if (pending.length > 0) return report('skip', `source ${source.qdb_name}: ${pending.join(', ')} still to confirm`);
  const keyPath = entitySet && `${entitySet}(qdb_table_logical_name='${source.qdb_table_logical_name}')?$select=qdb_name`;
  if (keyPath && await client.find(keyPath)) return report('exists', `source ${source.qdb_name} (${source.qdb_table_logical_name})`);
  report('create', `source ${source.qdb_name} (${source.qdb_table_logical_name})`);
  if (isApply) await client.send('POST', entitySet ?? await findEntitySet(client, 'qdb_survey_source'), source);
}

async function ensureSingleton({ client, isApply, report }, logicalName, row) {
  const pending = unconfirmedFields(row);
  if (pending.length > 0) return report('skip', `${logicalName} ${row.qdb_name}: ${pending.join(', ')} still to confirm`);
  const entitySet = await findEntitySet(client, logicalName);
  const existing = entitySet && await client.find(`${entitySet}?$select=qdb_name&$top=1`);
  if (existing?.value?.length > 0) return report('exists', `${logicalName} (${existing.value[0].qdb_name})`);
  report('create', `${logicalName} ${row.qdb_name}`);
  if (isApply) await client.send('POST', entitySet ?? await findEntitySet(client, logicalName), row);
}
