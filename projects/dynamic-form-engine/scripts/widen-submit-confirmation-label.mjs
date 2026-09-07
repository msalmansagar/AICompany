/**
 * Widens the acknowledgement checkbox label from String(200) to String(1000) on BOTH
 * entities that carry it:
 *   qdb_form_definition.qdb_submit_confirmation_label   — the final-submit gate
 *   qdb_form_tab.qdb_submit_confirmation_label          — the per-tab gate
 *
 * Both are widened together on purpose. The two gates render the same kind of sentence,
 * and leaving one at 200 makes the limit depend on which gate a maker happened to pick.
 *
 * Widening a Dataverse string is non-destructive — stored values are untouched and no
 * form, view or plugin needs republishing beyond the PublishXml below.
 *
 * Run: node --env-file=scripts/.env scripts/widen-submit-confirmation-label.mjs
 * Safe: re-running is a no-op once both columns already report 1000.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';

const ATTRIBUTE = 'qdb_submit_confirmation_label';
const TARGET_MAX_LENGTH = 1000;
const ENTITIES = ['qdb_form_definition', 'qdb_form_tab'];

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const response = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description ?? 'Token request failed');
  return payload.access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
    'MSCRM.SolutionUniqueName': SOLUTION_NAME,
  };
}

function attributeUrl(entity) {
  return `${API_BASE}/EntityDefinitions(LogicalName='${entity}')`
    + `/Attributes(LogicalName='${ATTRIBUTE}')/Microsoft.Dynamics.CRM.StringAttributeMetadata`;
}

async function readAttribute(token, entity) {
  const response = await fetch(attributeUrl(entity), { headers: headers(token) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${entity}: ${JSON.stringify(payload).slice(0, 300)}`);
  return payload;
}

async function widenAttribute(token, entity, current) {
  const body = { ...current, MaxLength: TARGET_MAX_LENGTH };
  const response = await fetch(attributeUrl(entity), {
    method: 'PUT',
    headers: { ...headers(token), 'MSCRM.MergeLabels': 'true' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${entity}: ${(await response.text()).slice(0, 400)}`);
}

async function publish(token, entities) {
  const entityXml = entities.map(e => `<entity>${e}</entity>`).join('');
  const response = await fetch(`${API_BASE}/PublishXml`, {
    method: 'POST', headers: headers(token),
    body: JSON.stringify({ ParameterXml: `<importexportxml><entities>${entityXml}</entities></importexportxml>` }),
  });
  console.log(`  PublishXml → ${response.status}`);
}

async function run() {
  console.log(`Widen ${ATTRIBUTE} to ${TARGET_MAX_LENGTH}\nOrg: ${DATAVERSE_URL}\n${'─'.repeat(60)}`);
  const token = await acquireToken();
  const widened = [];

  for (const entity of ENTITIES) {
    const current = await readAttribute(token, entity);
    if (current.MaxLength >= TARGET_MAX_LENGTH) {
      console.log(`  ${entity} → already ${current.MaxLength}, skipped`);
      continue;
    }
    await widenAttribute(token, entity, current);
    widened.push(entity);
    console.log(`  ${entity} → ${current.MaxLength} widened to ${TARGET_MAX_LENGTH}`);
  }

  if (widened.length === 0) {
    console.log(`${'─'.repeat(60)}\nNothing to do.`);
    return;
  }

  await publish(token, widened);

  for (const entity of ENTITIES) {
    const verified = await readAttribute(token, entity);
    console.log(`  verify ${entity}.MaxLength = ${verified.MaxLength}`);
    if (verified.MaxLength !== TARGET_MAX_LENGTH) {
      throw new Error(`${entity} still reports MaxLength ${verified.MaxLength}`);
    }
  }
  console.log(`${'─'.repeat(60)}\nBoth columns now accept ${TARGET_MAX_LENGTH} characters.`);
}

run().catch(error => { console.error(error.message); process.exit(1); });
