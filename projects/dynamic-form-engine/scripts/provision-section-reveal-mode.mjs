/**
 * Adds qdb_reveal_sections_one_at_a_time to qdb_form_tab.
 *
 *   node --env-file=scripts/.env scripts/provision-section-reveal-mode.mjs [--apply]
 *
 * Without --apply it only reports what it would do. Idempotent: an existing column is left
 * alone rather than recreated, so re-running after a partial failure is safe.
 *
 * Defaults to false so every existing tab keeps rendering all of its sections at once.
 */
import { acquireToken, headers, API } from './translations-lib.mjs';

const ENTITY = 'qdb_form_tab';
const SCHEMA_NAME = 'qdb_reveal_sections_one_at_a_time';
const DISPLAY_NAME = 'Reveal Sections One At A Time';
const DESCRIPTION =
  'When set, this tab shows one section at a time. The user advances with a section-scoped '
  + 'button targeting nextSection and cannot advance while the visible section has errors.';

const APPLY = process.argv.includes('--apply');

function label(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [
      { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
    ],
  };
}

function booleanAttribute() {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    AttributeType: 'Boolean',
    AttributeTypeName: { Value: 'BooleanType' },
    SchemaName: SCHEMA_NAME,
    LogicalName: SCHEMA_NAME.toLowerCase(),
    RequiredLevel: { Value: 'None' },
    DefaultValue: false,
    DisplayName: label(DISPLAY_NAME),
    Description: label(DESCRIPTION),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption: { '@odata.type': 'Microsoft.Dynamics.CRM.OptionMetadata', Value: 1, Label: label('Yes') },
      FalseOption: { '@odata.type': 'Microsoft.Dynamics.CRM.OptionMetadata', Value: 0, Label: label('No') },
    },
  };
}

async function attributeExists(H) {
  const res = await fetch(
    `${API}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${SCHEMA_NAME}')?$select=LogicalName`,
    { headers: H },
  );
  return res.ok;
}

async function run() {
  const H = headers(await acquireToken());

  console.log(`Target : ${ENTITY}.${SCHEMA_NAME}`);
  console.log(`Mode   : ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to create)'}\n`);

  if (await attributeExists(H)) {
    console.log('Already present — nothing to do.');
    return;
  }

  if (!APPLY) {
    console.log('Would create a Boolean column, default false, on every existing tab.');
    return;
  }

  const res = await fetch(`${API}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(booleanAttribute()),
  });
  if (!res.ok) throw new Error(`create failed ${res.status}: ${(await res.text()).slice(0, 400)}`);

  console.log('Created. Verifying...');
  if (!(await attributeExists(H))) throw new Error('Created but not readable back — check the org.');
  console.log('Verified present.');

  const publish = await fetch(`${API}/PublishAllXml`, { method: 'POST', headers: H, body: '{}' });
  console.log(publish.ok ? 'Published.' : `Publish failed ${publish.status} — publish manually.`);
}

run().catch((error) => { console.error('\nPROVISION FAILED:', error.message); process.exit(1); });
