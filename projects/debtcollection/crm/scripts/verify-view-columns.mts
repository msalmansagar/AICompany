/**
 * verify-view-columns.mts
 * Asserts that every column the React workspace reads exists on the organisation.
 *
 * KI-52 was a column name that looked right, satisfied every unit test, and returned nothing from the
 * real platform: the lookup was selected by its storage name instead of its `_value` form, so every
 * strategy resolved with zero actions while the suite stayed green. A mocked adapter cannot catch
 * that, because the mock answers whatever the code asked for.
 *
 * This asks the organisation instead. It reads `READ_REGISTRY` from the workspace's own schema module
 * — the same constant the queries use, not a copy — so the two cannot drift. A lookup column is
 * normalised back to its attribute name (`_qdb_strategyid_value` to `qdb_strategyid`) before the
 * check, and an annotation is skipped, because neither is an attribute.
 *
 * Read-only. It creates nothing and cleans up nothing.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/verify-view-columns.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import {
  ENTITY_SETS, NAVIGATION_REGISTRY, PARTY_COLLECTION_REGISTRY, READ_REGISTRY, toAttributeName,
} from '../../apps/web/src/data/schema.js';
import { DEFAULT_LOGICAL_NAMES, XrmCrmAdapter } from '../../apps/web/src/platform/XrmCrmAdapter.js';
import type { XrmLike } from '../../apps/web/src/platform/crmContext.js';

const AUTHORISED_ORG = 'org5869857f';

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** The adapter's own set-to-logical-name translation, so the script checks what the browser reads. */
const nameResolver = new XrmCrmAdapter({} as XrmLike, DEFAULT_LOGICAL_NAMES);

async function main() {
  console.log('=== Every column the workspace reads, checked against the organisation ===\n');

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}\n`);

  const token = await acquireToken(cfg);
  let checked = 0;

  for (const entry of READ_REGISTRY) {
    const logicalName = nameResolver.toLogicalName(entry.entitySet);
    const response = await apiGet(cfg, token, SOLUTION_NAME,
      `/EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=LogicalName`);
    const present = new Set<string>((response?.value ?? []).map((a: { LogicalName: string }) => a.LogicalName));

    const wanted = entry.columns
      .map(toAttributeName)
      .filter((name): name is string => name !== undefined);
    const missing = wanted.filter(name => !present.has(name));
    checked += wanted.length;

    check(
      `${entry.entitySet} → ${logicalName}: every read column exists`,
      missing.length === 0,
      missing.length === 0 ? `${wanted.length} columns` : `MISSING ${missing.join(', ')}`,
    );
  }

  // ── Navigation properties ─────────────────────────────────────────────────
  // A lookup's write name is not derivable from its read name: `qdb_collectioncaseid` is suffixed
  // with the referencing entity on the activity and bare on the snapshot, decided by whether
  // anything else points at the same table. Reading them back is the only way to be sure (KI-69).
  console.log('');
  for (const entity of [...new Set(NAVIGATION_REGISTRY.map(entry => entry.entity))]) {
    const response = await apiGet(cfg, token, SOLUTION_NAME,
      `/EntityDefinitions(LogicalName='${entity}')/ManyToOneRelationships` +
      '?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName');
    const actual = new Set((response?.value ?? []).map(
      (relationship: { ReferencingEntityNavigationPropertyName: string }) =>
        relationship.ReferencingEntityNavigationPropertyName));

    const expected = NAVIGATION_REGISTRY.filter(entry => entry.entity === entity);
    const missing = expected.filter(entry => !actual.has(entry.navigationProperty));
    checked += expected.length;

    check(
      `${entity}: every lookup binds through a real navigation property`,
      missing.length === 0,
      missing.length === 0
        ? expected.map(e => e.navigationProperty).join(', ')
        : `MISSING ${missing.map(e => `${e.attribute} -> ${e.navigationProperty}`).join('; ')}`,
    );
  }

  // ── Entity set names ──────────────────────────────────────────────────────
  // An entity set name is **given by the platform**, not produced by pluralising a logical name.
  // `fax` is served at `faxes`, `qdb_crmlogs` at `qdb_crmlogses`, `activityparty` at
  // `activityparties`, and a naive `+ "s"` gets all three wrong — which is how a Node harness once
  // wrote to `/faxs` while its verifier read from `/faxe`. Every set the workspace names is read
  // back from `EntityDefinitions`, and the naive form is computed alongside so the rule is
  // demonstrated rather than asserted.
  console.log('');
  let naivelyWrong = 0;
  for (const [name, entitySet] of Object.entries(ENTITY_SETS)) {
    const logicalName = nameResolver.toLogicalName(entitySet);
    const definition = await apiGet(cfg, token, SOLUTION_NAME,
      `/EntityDefinitions(LogicalName='${logicalName}')?$select=EntitySetName`);
    const actual = definition?.EntitySetName;
    if (actual !== `${logicalName}s`) naivelyWrong += 1;
    checked += 1;

    check(
      `ENTITY_SETS.${name}: the platform's own set name is "${entitySet}"`,
      actual === entitySet,
      actual === entitySet ? logicalName : `platform says "${actual}"`,
    );
  }
  check(
    'a set name is not a pluralisation: some would be wrong by adding "s"',
    naivelyWrong > 0,
    `${naivelyWrong} of ${Object.keys(ENTITY_SETS).length} differ from logicalName + "s"`,
  );

  // ── Collection-valued navigation properties ───────────────────────────────
  // The recipient ActivityParty is a separate POST to a collection whose name is as underivable as
  // a lookup's. Read from `OneToManyRelationships` on the owning activity (KI-85).
  console.log('');
  for (const entry of PARTY_COLLECTION_REGISTRY) {
    const response = await apiGet(cfg, token, SOLUTION_NAME,
      `/EntityDefinitions(LogicalName='${entry.entity}')/OneToManyRelationships`
      + '?$select=ReferencingEntity,ReferencedEntityNavigationPropertyName'
      + "&$filter=ReferencingEntity eq 'activityparty'");
    const actual = new Set((response?.value ?? []).map(
      (relationship: { ReferencedEntityNavigationPropertyName: string }) =>
        relationship.ReferencedEntityNavigationPropertyName));
    checked += 1;

    check(
      `${entry.entity}: parties are appended through "${entry.collection}"`,
      actual.has(entry.collection),
      actual.has(entry.collection) ? 'activityparty collection' : `platform offers ${[...actual].join(', ')}`,
    );
  }

  console.log(`\n  ${checked} column and navigation-property names checked against live metadata.`);
  console.log('\n  NOT proven by this script: that a query returns the values a screen expects, or');
  console.log('  that the workspace runs inside Dynamics. Existence is necessary, not sufficient —');
  console.log('  KI-52 was a column that existed and still returned nothing when selected wrongly.');

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error('\n[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
