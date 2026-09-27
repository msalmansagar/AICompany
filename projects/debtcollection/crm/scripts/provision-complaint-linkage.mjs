/**
 * provision-complaint-linkage.mjs
 * The one link that traces a Collection Activity to its formal Complaint. One lookup, nothing more.
 *
 *   qdb_collectionactivity.qdb_complaintcaseid  ->  incident
 *
 * **`incident` is not modified.** Case Management owns the Complaint: its lifecycle, categories,
 * department resolution, SLA and the escalation ladder to the CEO. DCP integrates with it and adds
 * nothing to it.
 *
 * **An existing relationship was inspected first, and rejected for a stated reason.**
 * `qdb_collectionactivity.regardingobjectid` already reaches `incident` through
 * `regardingobjectid_incident_qdb_collectionactivity`, so no provisioning would have been needed —
 * but that column is already the documented carrier for the activity's collection case and for the
 * `fax`/`email` communication mirroring, and it can also target `qdb_qdblegal`. A fourth meaning
 * would make "what does regardingobjectid mean on this row" unanswerable, which is precisely the
 * overload KI-71 records and WP9 declined for Legal. The reference therefore gets its own column.
 *
 * **Optional and additive.** Every existing activity keeps it null, and null means no formal
 * Complaint has been raised from this activity — true of all of them. Nothing is backfilled.
 *
 * **It is traceability, not idempotency.** Retry safety comes from creating the Case at a
 * caller-chosen id with `If-None-Match: *`, which the platform refuses with 412 on a second
 * attempt. A lookup cannot provide that, because two racing writers would both read it empty.
 *
 * `RemoveLink` on delete, deliberately: removing a Complaint must never cascade into deleting
 * collection activity.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/provision-complaint-linkage.mjs
 */

import { loadConfig, acquireToken, apiGet, apiPost } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { ensureRelationship } from './lib/relationships.mjs';
import { oneToMany } from './lib/qdb-attr-builders.mjs';

const AUTHORISED_ORG = 'org5869857f';
const ENTITY = 'qdb_collectionactivity';
const COMPLAINT = 'incident';
const LOOKUP = 'qdb_complaintcaseid';
const RELATIONSHIP = 'qdb_collectionactivity_complaintcase';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function publishAll(cfg, token) {
  try {
    await apiPost(cfg, token, SOLUTION_NAME, '/PublishAllXml', {});
    return true;
  } catch (error) {
    console.error(`  [publish] ${error.message}`);
    return false;
  }
}

async function main() {
  const cfg = loadConfig();
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg);
  console.log(`  Organisation: ${cfg.orgUrl}\n`);

  console.log('─── Before: the Complaint entity, so the change can be shown to be additive ───');
  const before = await complaintShape(cfg, token);
  console.log(`  ${COMPLAINT}: ${before.attributes} attributes, ${before.lookups} lookups`);

  console.log('\n─── Existing paths, inspected before provisioning ───');
  const existing = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${ENTITY}')/ManyToOneRelationships`
    + `?$select=ReferencingAttribute&$filter=ReferencedEntity eq '${COMPLAINT}'`);
  console.log(`  ${ENTITY} already reaches ${COMPLAINT} through: `
    + `${existing.value.map(r => r.ReferencingAttribute).join(', ') || 'nothing'}`);
  console.log('  regardingobjectid is rejected as the carrier: it already means the collection '
    + 'case,\n  and the fax/email mirroring, and can target the Litigation Request.');

  console.log('\n─── Relationship ───');
  await ensureRelationship(cfg, token, SOLUTION_NAME, oneToMany({
    schemaName: RELATIONSHIP,
    referencing: ENTITY,
    referenced: COMPLAINT,
    lookupLogical: LOOKUP,
    lookupLabel: 'Complaint Case',
  }));

  console.log('\n─── Publish ───');
  check('metadata published', await publishAll(cfg, token));

  await verify(cfg, token, before);

  const failed = results.filter(result => !result.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

async function complaintShape(cfg, token) {
  const attributes = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${COMPLAINT}')/Attributes?$select=LogicalName`);
  const relationships = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${COMPLAINT}')/ManyToOneRelationships?$select=SchemaName`);
  return { attributes: attributes.value.length, lookups: relationships.value.length };
}

async function verify(cfg, token, before) {
  console.log('\n─── Verification ───');

  const attribute = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${LOOKUP}')`
    + '?$select=LogicalName,AttributeType,RequiredLevel');
  check('the lookup exists on the collection activity', attribute.LogicalName === LOOKUP,
    attribute.AttributeType);
  check('and it is optional, so no existing activity becomes invalid',
    attribute.RequiredLevel?.Value === 'None', attribute.RequiredLevel?.Value);

  const relationship = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${ENTITY}')/ManyToOneRelationships`
    + '?$select=SchemaName,ReferencedEntity,ReferencingEntityNavigationPropertyName'
    + `&$filter=ReferencingAttribute eq '${LOOKUP}'`);
  const found = relationship.value[0];
  check('it targets the Case entity', found?.ReferencedEntity === COMPLAINT,
    String(found?.ReferencedEntity));

  /*
   * Read from metadata, never derived. `qdb_Customer` on the Legal entity was capitalised and cost
   * a 400; this family of name has now caused four separate defects (KI-52, KI-57, KI-69, WP13).
   */
  check('its write-side navigation property is reported by the platform',
    Boolean(found?.ReferencingEntityNavigationPropertyName),
    found?.ReferencingEntityNavigationPropertyName);

  const after = await complaintShape(cfg, token);
  check('the Case entity gained NO attribute',
    after.attributes === before.attributes, `${before.attributes} → ${after.attributes}`);
  check('and gained NO lookup of its own',
    after.lookups === before.lookups, `${before.lookups} → ${after.lookups}`);

  const populated = await apiGet(cfg, token, SOLUTION_NAME,
    `/qdb_collectionactivities?$select=activityid&$count=true&$top=1`
    + `&$filter=_${LOOKUP}_value ne null`);
  check('nothing was backfilled — every existing activity is still unlinked',
    (populated['@odata.count'] ?? -1) === 0, `${populated['@odata.count']} linked`);

  console.log(`\n  Write with:  "${found?.ReferencingEntityNavigationPropertyName}@odata.bind"`);
  console.log(`  Read with:   _${LOOKUP}_value`);
}

await main();
