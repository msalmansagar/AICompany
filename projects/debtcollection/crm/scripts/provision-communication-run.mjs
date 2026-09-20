/**
 * provision-communication-run.mjs
 * Creates `qdb_communicationrun` — the durable header for a bulk communication (KI-84).
 *
 * **Exactly the approved schema**, from `docs/Phase7_CommunicationRun_SchemaProposal.md`: one
 * entity, fourteen custom columns, one lookup to `qdb_communicationtemplate`, no child entity. No
 * convenience field has been added because provisioning became possible — an approved proposal is a
 * boundary, not a starting point.
 *
 * What this entity is **not**: it never holds a message sent to anyone. The per-recipient records
 * remain native `fax` and `email`, which is what QDB's sending mechanism consumes.
 *
 * Every type here exists in Dynamics 365 CE 9.1 — Single Line of Text, Multiple Lines of Text, Whole
 * Number, local Choice, Lookup, Date and Time. No elastic table, no JSON or file column, and no
 * multi-select choice.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra QDB_OPTION_VALUE_PREFIX=10000 \
 *   node --env-file="<path>/.env" crm/scripts/provision-communication-run.mjs [--confirm]
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { ensureEntity } from './lib/entities.mjs';
import { ensureRelationship } from './lib/relationships.mjs';
import { strAttr, intAttr, dtAttr, memoAttrN, oneToMany } from './lib/qdb-attr-builders.mjs';
import { label1033, emptyLabel, optionItem } from './lib/labels.mjs';

const AUTHORISED_ORG = 'org5869857f';
const ENTITY = 'qdb_communicationrun';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * The frozen population column's capacity.
 *
 * `Multiple Lines of Text` tops out at 1,048,576 characters. The manifest is validated against the
 * value **read back from live metadata** rather than against this constant — the constant is what we
 * ask for, and metadata is what we got.
 */
const FROZEN_POPULATION_MAX = 1048576;

/**
 * A LOCAL choice, values inside the publisher's option-value range.
 *
 * Local rather than global on purpose: both sets mean something only to a communication run, and a
 * global set would put two DCP-only vocabularies into a namespace 922 entities share. The shared
 * `picklistAttr` builder only makes global sets, so this is the local equivalent.
 *
 * Values are written explicitly rather than left to the platform, so the same numbers appear on
 * Cloud and on-premises and a code that means Running in one place cannot mean Paused in another.
 */
function localPicklistAttr(logicalName, displayLabel, options, req = 'None') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    AttributeType: 'Picklist',
    AttributeTypeName: { Value: 'PicklistType' },
    SchemaName: logicalName,
    LogicalName: logicalName,
    DisplayName: label1033(displayLabel),
    Description: emptyLabel(),
    RequiredLevel: { Value: req, CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' },
    IsSecured: false,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      // A local set still needs its own name and labels; omitting them is rejected with the
      // platform's unhelpful "An unexpected error occurred", which is how this was found.
      Name: `${ENTITY}_${logicalName}`,
      DisplayName: label1033(displayLabel),
      Description: emptyLabel(),
      IsGlobal: false,
      OptionSetType: 'Picklist',
      // `optionItem` rather than a bare object: each option carries a Description, and the platform
      // refuses the attribute without it.
      Options: options.map(o => optionItem(o.value, o.label)),
    },
  };
}

/** Channels a bulk run may use. Bulk WhatsApp is deliberately absent — it is not in scope. */
const CHANNEL_OPTIONS = [
  { value: 100000700, label: 'SMS' },
  { value: 100000701, label: 'Email' },
];

const STATUS_OPTIONS = [
  { value: 100000710, label: 'Draft' },
  { value: 100000711, label: 'Running' },
  { value: 100000712, label: 'Paused' },
  { value: 100000713, label: 'Completed' },
  { value: 100000714, label: 'Cancelled' },
  { value: 100000715, label: 'Failed' },
];

/** The fourteen approved columns, in the order the proposal lists them. */
function attributes() {
  return [
    strAttr('qdb_name', 'Name', 200, 'ApplicationRequired'),
    localPicklistAttr('qdb_channel', 'Channel', CHANNEL_OPTIONS, 'ApplicationRequired'),
    localPicklistAttr('qdb_status', 'Status', STATUS_OPTIONS, 'ApplicationRequired'),
    // qdb_templateid is a LOOKUP and is provisioned as a relationship, not an attribute.
    memoAttrN('qdb_messagebody', 'Message Body (frozen)', 100000),
    strAttr('qdb_subject', 'Subject (frozen)', 400),
    localPicklistAttr('qdb_selectionmode', 'Selection Mode', [
      { value: 100000720, label: 'Selected Records' },
      { value: 100000721, label: 'Filter Definition' },
    ], 'ApplicationRequired'),
    memoAttrN('qdb_filterdefinition', 'Filter Definition (audit only)', 10000),
    memoAttrN('qdb_frozenpopulation', 'Frozen Population', FROZEN_POPULATION_MAX),
    intAttr('qdb_totalrecipients', 'Total Recipients'),
    intAttr('qdb_cursor', 'Cursor'),
    memoAttrN('qdb_failedrecipients', 'Failed Recipients', 100000),
    dtAttr('qdb_startedon', 'Started On'),
    dtAttr('qdb_completedon', 'Completed On'),
  ];
}

function entityDefinition() {
  const attrs = attributes().map(a => (a.LogicalName === 'qdb_name' ? { ...a, IsPrimaryName: true } : a));
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: ENTITY,
    LogicalName: ENTITY,
    DisplayName: label1033('Communication Run'),
    DisplayCollectionName: label1033('Communication Runs'),
    Description: label1033(
      'The durable header for one bulk communication. The per-recipient records are native Fax and '
      + 'Email activities; this never holds a message sent to anyone. KI-84.'),
    // User-owned so CRM's own security decides who may see and resume a run.
    OwnershipType: 'UserOwned',
    IsActivity: false,
    HasNotes: false,
    HasActivities: false,
    Attributes: attrs,
  };
}

async function main() {
  const confirmed = process.argv.includes('--confirm');
  console.log(`=== Provision ${ENTITY} — ${confirmed ? 'APPLY' : 'DRY RUN'} ===\n`);

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
  console.log(`  Columns: ${attributes().length} + 1 lookup (qdb_templateid)\n`);

  if (!confirmed) {
    for (const a of attributes()) console.log(`  [WOULD CREATE] ${a.LogicalName}`);
    console.log('\n  Dry run. Pass --confirm to apply.');
    return;
  }

  const token = await acquireToken(cfg);

  console.log('─── Entity ───');
  await ensureEntity(cfg, token, SOLUTION_NAME, entityDefinition());
  check('the entity exists', true, ENTITY);

  // `ensureEntity` creates the table with its primary column and then adds the rest itself, so a
  // second pass here is not a safety net — it races the metadata cache and fails with "an attribute
  // with the specified name already exists". Creating columns is its job; verifying them is this
  // script's.

  console.log('\n─── Lookup ───');
  await ensureRelationship(cfg, token, SOLUTION_NAME, oneToMany({
    schemaName: 'qdb_communicationrun_template',
    referencing: ENTITY,
    referenced: 'qdb_communicationtemplate',
    lookupLogical: 'qdb_templateid',
    lookupLabel: 'Communication Template',
  }));

  await verify(cfg, token);

  const failed = results.filter(r => !r.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  if (failed.length > 0) process.exit(1);
}

/**
 * Verifies against live metadata rather than against what we asked for.
 *
 * The capacity check matters most: the executor refuses a run whose manifest will not fit, and it
 * must size that refusal against the column the platform actually created. A `MaxLength` silently
 * clamped to something smaller would turn a safe refusal into a truncated population.
 */
async function verify(cfg, token) {
  console.log('\n─── Verification (live metadata) ───');
  const meta = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${ENTITY}')/Attributes?$select=LogicalName,AttributeType`);
  const present = new Set((meta?.value ?? []).map(a => a.LogicalName));

  const expected = [...attributes().map(a => a.LogicalName), 'qdb_templateid'];
  const missing = expected.filter(n => !present.has(n));
  check('every approved column exists on the organisation', missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${expected.length} columns`);

  const frozen = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='qdb_frozenpopulation')`
    + '/Microsoft.Dynamics.CRM.MemoAttributeMetadata?$select=LogicalName,MaxLength');
  const actualMax = frozen?.MaxLength;
  check('the frozen-population column reports its real capacity', typeof actualMax === 'number',
    `MaxLength = ${actualMax}`);
  check('capacity is the approved maximum, so the executor sizes refusals correctly',
    actualMax === FROZEN_POPULATION_MAX, `${actualMax} vs ${FROZEN_POPULATION_MAX} requested`);

  // Nothing beyond the approved proposal may appear. Provisioning being approved is not licence to
  // add convenience fields, and a drift check is cheaper than a review.
  //
  // The platform derives columns of its own that were never asked for: a `Virtual` companion for
  // every choice and lookup (`qdb_channelname`, `qdb_templateidname`) and the `Uniqueidentifier`
  // primary key. They are excluded by TYPE rather than by name pattern, so a real column that
  // happened to end in "name" would still be caught.
  //
  // A lookup's companion is a plain `String`, not `Virtual`, so type alone does not exclude
  // `qdb_templateidname`. Companions are derived from the expected names instead, which stays
  // precise: an unapproved column called `qdb_somethingname` is only forgiven if `qdb_something`
  // was itself approved.
  const companions = new Set(expected.map(n => `${n}name`));
  const authored = (meta?.value ?? [])
    .filter(a => a.LogicalName.startsWith('qdb_'))
    .filter(a => a.AttributeType !== 'Virtual' && a.AttributeType !== 'Uniqueidentifier')
    .map(a => a.LogicalName)
    .filter(n => !companions.has(n));
  const unexpected = authored.filter(n => !expected.includes(n));
  check('no column exists beyond the approved proposal', unexpected.length === 0,
    unexpected.length ? `unexpected: ${unexpected.join(', ')}` : `${authored.length} authored columns`);
}

main().catch(error => {
  console.error('\n[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
