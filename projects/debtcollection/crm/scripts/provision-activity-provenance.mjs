/**
 * provision-activity-provenance.mjs
 * KI-71 — records WHY a collection activity exists. Two optional columns, nothing more.
 *
 * Phase 6 correlated activities to strategy actions by **Activity Type**, and said so on screen
 * rather than pretending otherwise. That is correspondence, not provenance, and it cannot survive
 * Phase 8: one strategy may hold two actions of the same type, and two strategies may use the same
 * type. Metadata confirms the gap rather than inferring it — `qdb_collectionactivity` has zero
 * lookups to `qdb_strategyaction` and no alternate keys.
 *
 *   qdb_strategyactionid   lookup  -> which strategy action requested this work
 *   qdb_origin             choice  -> Manual or Strategy generated, STATED not inferred
 *
 * **Why both.** The lookup alone cannot answer it. An officer who *accepts* a planned action
 * produces an activity that legitimately carries a strategy action, so "is the lookup set" would
 * collapse manual and automated work into one — the same mistake as inferring provenance from
 * Activity Type, one level up.
 *
 * **Idempotency is deliberately not a column here.** Strategy-generated work takes a deterministic
 * id, `uuidv5(caseId | episodeNumber | strategyActionId | evaluationContext)`, created with
 * `If-None-Match: *` (ADR-DCP-20). A counter or an "already generated" flag is exactly the
 * bookkeeping a crash invalidates.
 *
 * **Backfill is deliberately nothing.** Existing Phase 6/7 activities keep both columns null.
 * `qdb_origin` is NOT defaulted to Manual: null means "created before provenance was recorded",
 * and asserting those were manual would invent history the platform never held.
 *
 * Both are optional and additive, so nothing existing changes behaviour. A plain M:1 lookup and a
 * local option set behave identically on Dataverse and on Dynamics 365 CE 9.1.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra QDB_OPTION_VALUE_PREFIX=10000 \
 *   node --env-file="<path>/.env" crm/scripts/provision-activity-provenance.mjs
 */

import { loadConfig, acquireToken, apiGet, apiPost } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { ensureAttribute } from './lib/entities.mjs';
import { ensureRelationship } from './lib/relationships.mjs';
import { oneToMany } from './lib/qdb-attr-builders.mjs';
import { resolveQdbOptionValueBase } from './lib/qdb-option-set-defs.mjs';
import { label1033, emptyLabel, optionItem } from './lib/labels.mjs';

const AUTHORISED_ORG = 'org5869857f';
const ENTITY = 'qdb_collectionactivity';
const LOOKUP = 'qdb_strategyactionid';
const ORIGIN = 'qdb_origin';
const RELATIONSHIP = 'qdb_collectionactivity_strategyaction';

/**
 * Offsets 800 and 801, clear of every range already in use.
 *
 * Written explicitly rather than left to the platform so the same number means the same thing on
 * Cloud and on-premises — a value that means Manual in one organisation and something else in
 * another is the kind of drift no test catches.
 */
const ORIGIN_OFFSETS = { manual: 800, strategyGenerated: 801 };

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A LOCAL choice: origin means something only to a collection activity. */
function originAttribute(base) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    AttributeType: 'Picklist',
    AttributeTypeName: { Value: 'PicklistType' },
    SchemaName: ORIGIN,
    LogicalName: ORIGIN,
    DisplayName: label1033('Origin'),
    Description: label1033(
      'How this activity came to exist. Null means it predates provenance being recorded — '
      + 'it is not a claim that the activity was manual.'),
    RequiredLevel: { Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' },
    IsSecured: false,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      // A local set still needs its own name and labels; omitting them is rejected with the
      // platform's unhelpful "An unexpected error occurred".
      Name: `${ENTITY}_${ORIGIN}`,
      DisplayName: label1033('Origin'),
      Description: emptyLabel(),
      IsGlobal: false,
      OptionSetType: 'Picklist',
      Options: [
        optionItem(base + ORIGIN_OFFSETS.manual, 'Manual'),
        optionItem(base + ORIGIN_OFFSETS.strategyGenerated, 'Strategy generated'),
      ],
    },
  };
}

/** Publishing can report success having done nothing, so it retries and is verified after. */
async function publishAll(cfg, token) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await apiPost(cfg, token, SOLUTION_NAME, '/PublishAllXml', {});
      console.log(`  published (attempt ${attempt})`);
      return true;
    } catch (error) {
      console.warn(`  [WARN] PublishAllXml attempt ${attempt} failed: ${error.message}`);
    }
  }
  return false;
}

async function verify(cfg, token, base) {
  console.log('\n─── Verification (live metadata, not what we asked for) ───');

  const attributes = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${ENTITY}')/Attributes?$select=LogicalName,AttributeType,RequiredLevel`);
  const byName = new Map((attributes?.value ?? []).map(a => [a.LogicalName, a]));

  const lookup = byName.get(LOOKUP);
  check('the provenance lookup exists', Boolean(lookup), lookup ? `type=${lookup.AttributeType}` : 'missing');
  check('the provenance lookup is OPTIONAL — Phase 6 activities have none',
    lookup?.RequiredLevel?.Value === 'None', lookup?.RequiredLevel?.Value);

  const origin = byName.get(ORIGIN);
  check('the origin column exists', Boolean(origin), origin ? `type=${origin.AttributeType}` : 'missing');
  check('the origin column is OPTIONAL — null means "predates provenance"',
    origin?.RequiredLevel?.Value === 'None', origin?.RequiredLevel?.Value);

  // The relationship, read from metadata — the navigation property name is not derivable, and this
  // is the third time on this programme that guessing one has cost real debugging (KI-52/57/69).
  const detail = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${ENTITY}')?$select=LogicalName`
    + '&$expand=ManyToOneRelationships($select=SchemaName,ReferencedEntity,ReferencingAttribute,'
    + 'ReferencingEntityNavigationPropertyName)');
  const relationship = (detail?.ManyToOneRelationships ?? [])
    .find(r => r.ReferencingAttribute === LOOKUP);
  check('the lookup points at qdb_strategyaction',
    relationship?.ReferencedEntity === 'qdb_strategyaction', relationship?.ReferencedEntity);
  check('its navigation property is readable for binding',
    Boolean(relationship?.ReferencingEntityNavigationPropertyName),
    relationship?.ReferencingEntityNavigationPropertyName);

  const options = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${ORIGIN}')`
    + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet');
  const values = (options?.OptionSet?.Options ?? []).map(o => o.Value).sort((a, b) => a - b);
  const expected = [base + ORIGIN_OFFSETS.manual, base + ORIGIN_OFFSETS.strategyGenerated];
  check('origin carries exactly the two provisioned values',
    JSON.stringify(values) === JSON.stringify(expected), `${values.join(', ')}`);

  // Existing rows must be untouched. Provenance is additive; a backfill would be an assertion
  // about history nobody made.
  const backfilled = await apiGet(cfg, token, SOLUTION_NAME,
    `/qdb_collectionactivities?$select=activityid&$filter=${ORIGIN} ne null&$top=1&$count=true`);
  check('no existing activity was back-filled with an invented origin',
    (backfilled?.['@odata.count'] ?? 0) === 0, `${backfilled?.['@odata.count'] ?? 0} rows carry an origin`);
}

async function main() {
  const cfg = loadConfig();
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const base = resolveQdbOptionValueBase();
  const token = await acquireToken(cfg);
  console.log(`  Organisation: ${cfg.orgUrl}`);
  console.log(`  Option-value base: ${base}\n`);

  console.log('─── Columns ───');
  await ensureAttribute(cfg, token, SOLUTION_NAME, { entityName: ENTITY, attribute: originAttribute(base) });

  console.log('\n─── Relationship ───');
  await ensureRelationship(cfg, token, SOLUTION_NAME, oneToMany({
    schemaName: RELATIONSHIP,
    referencing: ENTITY,
    referenced: 'qdb_strategyaction',
    lookupLogical: LOOKUP,
    lookupLabel: 'Originating Strategy Action',
  }));

  console.log('\n─── Publish ───');
  check('metadata published', await publishAll(cfg, token));

  await verify(cfg, token, base);

  const failed = results.filter(r => !r.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
