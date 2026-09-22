/**
 * provision-legal-linkage.mjs
 * KI-110 — the one link that completes the Legal traceability chain. One lookup, nothing more.
 *
 *   qdb_collectionactivity.qdb_legalrequestid  ->  qdb_qdblegal
 *
 * **`qdb_qdblegal` is not modified.** QDB's Litigation Request is an established entity with 158
 * attributes, 16 lookups, 25 status reasons and an on-premises process behind it. WP9 discovery
 * found no lookup from it to any collections table and no alternate key, so something had to carry
 * the reference — and the choice of *which side* matters:
 *
 * - Adding a column to `qdb_qdblegal` would change an entity another team owns and whose real
 *   automation this organisation cannot even see. Rejected.
 * - `qdb_oldlegalreferencename` (100 chars) is a documented Legal-side field. Overloading it is
 *   precisely the mistake KI-71 records. Rejected.
 * - `qdb_collectionactivity.regardingobjectid` *can* already target `qdb_qdblegal`, which is
 *   tempting because it needs no provisioning at all — but that column is already the documented
 *   carrier for the activity's case and for `fax`/`email` communication mirroring. A third meaning
 *   would make "what does regardingobjectid mean here" unanswerable. Rejected.
 *
 * So the reference lives on DCP's own record, where DCP owns the schema and the meaning is
 * singular. The chain then reads end to end:
 *
 *   Collection Case -> Strategy -> Strategy Action -> Legal Recommendation Activity
 *                                                  -> Litigation Request
 *
 * **Optional and additive.** Every existing activity keeps it null, and null means "no Legal
 * hand-off has been made", which is true of all of them. Nothing is backfilled and no behaviour
 * changes for work that never reaches Legal.
 *
 * **It is also where idempotency anchors.** `qdb_qdblegal` has no alternate key, so a retry cannot
 * be made safe from the Legal side. The Legal Recommendation Activity is the stable source intent
 * (§8), its id is already deterministic for strategy-generated work, and this lookup is what lets
 * a second attempt discover that the first one succeeded.
 *
 * `RemoveLink` on delete, deliberately: removing a Litigation Request must never cascade into
 * deleting collection activity, and the collection record should survive as history.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/provision-legal-linkage.mjs
 */

import { loadConfig, acquireToken, apiGet, apiPost } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { ensureRelationship } from './lib/relationships.mjs';
import { oneToMany } from './lib/qdb-attr-builders.mjs';

const AUTHORISED_ORG = 'org5869857f';
const ENTITY = 'qdb_collectionactivity';
const LEGAL = 'qdb_qdblegal';
const LOOKUP = 'qdb_legalrequestid';
const RELATIONSHIP = 'qdb_collectionactivity_qdblegal';

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

  console.log('─── Before: what the Legal entity looks like, so the change can be shown to be additive ───');
  const before = await legalShape(cfg, token);
  console.log(`  ${LEGAL}: ${before.attributes} attributes, ${before.lookups} lookups`);

  console.log('\n─── Relationship ───');
  await ensureRelationship(cfg, token, SOLUTION_NAME, oneToMany({
    schemaName: RELATIONSHIP,
    referencing: ENTITY,
    referenced: LEGAL,
    lookupLogical: LOOKUP,
    lookupLabel: 'Litigation Request',
  }));

  console.log('\n─── Publish ───');
  check('metadata published', await publishAll(cfg, token));

  await verify(cfg, token, before);

  const failed = results.filter(result => !result.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

async function legalShape(cfg, token) {
  const attributes = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${LEGAL}')/Attributes?$select=LogicalName`);
  const relationships = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${LEGAL}')/ManyToOneRelationships?$select=SchemaName`);
  return { attributes: attributes.value.length, lookups: relationships.value.length };
}

async function verify(cfg, token, before) {
  console.log('\n─── Verification ───');

  const attribute = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${LOOKUP}')`
    + '?$select=LogicalName,AttributeType,RequiredLevel');
  check('the lookup exists on the collection activity', attribute.LogicalName === LOOKUP,
    `${attribute.AttributeType}`);
  check('and it is optional, so no existing activity becomes invalid',
    attribute.RequiredLevel?.Value === 'None', attribute.RequiredLevel?.Value);

  const relationship = await apiGet(cfg, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${ENTITY}')/ManyToOneRelationships`
    + `?$select=SchemaName,ReferencedEntity,ReferencingAttribute,ReferencingEntityNavigationPropertyName`
    + `&$filter=ReferencingAttribute eq '${LOOKUP}'`);
  const found = relationship.value[0];
  check('it targets the Litigation Request entity', found?.ReferencedEntity === LEGAL,
    String(found?.ReferencedEntity));

  /*
   * The navigation property is READ from metadata, never derived.
   *
   * KI-52, KI-57 and KI-69 were all this family of name. Whether the platform suffixes it with the
   * referencing entity depends on what else points at the target, which is not knowable in advance.
   */
  check('its write-side navigation property is reported by the platform',
    Boolean(found?.ReferencingEntityNavigationPropertyName),
    found?.ReferencingEntityNavigationPropertyName);

  const after = await legalShape(cfg, token);
  check('the Litigation Request entity gained NO attribute',
    after.attributes === before.attributes, `${before.attributes} → ${after.attributes}`);
  check('and gained NO lookup of its own',
    after.lookups === before.lookups, `${before.lookups} → ${after.lookups}`);

  const populated = await apiGet(cfg, token, SOLUTION_NAME,
    `/qdb_collectionactivities?$select=activityid&$count=true&$top=1`
    + `&$filter=_${LOOKUP}_value ne null`);
  check('nothing was backfilled — every existing activity is still unlinked',
    (populated['@odata.count'] ?? -1) === 0, `${populated['@odata.count']} linked`);

  const readable = await apiGet(cfg, token, SOLUTION_NAME,
    `/qdb_collectionactivities?$select=activityid,_${LOOKUP}_value&$top=1`);
  check('the read form of the column answers from the organisation',
    Array.isArray(readable.value));

  console.log(`\n  Write with:  "${found?.ReferencingEntityNavigationPropertyName}@odata.bind"`);
  console.log(`  Read with:   _${LOOKUP}_value`);
}

await main();
