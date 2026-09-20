/**
 * spike-activity-idempotency.mts
 * Does upsert-by-id work on the NATIVE activity entities Phase 7 writes?
 *
 * ADR-DCP-19 established idempotent create on `qdb_collectionactivity` — a custom entity — using a
 * client-chosen primary key with `If-None-Match: *`. Phase 7 writes `fax` and `email`, which are
 * **native** activity entities, and it is not established that they behave the same way. The Phase 7
 * authorisation is explicit that the Phase 6 implementation must not simply be assumed to carry over.
 *
 * This matters more here than it did in Phase 6. A duplicate collection note is untidy; a duplicate
 * SMS reaches the customer twice, and a bulk run that retries a failed batch could reach thousands of
 * customers twice. The entire bulk design rests on the answer, so it is established before any send
 * path exists rather than discovered afterwards.
 *
 * Nothing here can actually send: QDB's dispatch Custom Workflow Activity is not installed on this
 * organisation (KI-83), so a created `fax` row is inert. That is stated rather than relied upon — the
 * rows are `SMOKE-` marked and removed regardless.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/spike-activity-idempotency.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { buildNodeHarness } from './lib/node-workspace-harness.mts';

const AUTHORISED_ORG = 'org5869857f';
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const mark = (what: string) => `SMOKE-P7IDEM-${what}-${stamp}`;

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const created: { set: string; id: string }[] = [];

async function main(): Promise<void> {
  console.log('=== Phase 7 WP3 — upsert-by-id on native activity entities ===\n');

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) throw new Error(`Refusing to run: connected to ${host}`);
  console.log(`  Organisation: ${host}`);
  console.log('  NOTE: QDB\'s dispatcher is not installed here, so no fax row can send (KI-83).\n');

  const token = await acquireToken(cfg);
  const { adapter, transport } = buildNodeHarness(cfg.apiBase, token);

  try {
    for (const entity of ['faxes', 'emails'] as const) {
      console.log(`\n  ── ${entity} ──`);
      const id = crypto.randomUUID();
      const subject = mark(entity.toUpperCase());

      // 1. Create at an id we chose.
      const first = await adapter.createIdempotent(entity, id, { subject });
      check(`${entity}: a record can be created at a client-chosen id`, first.created === true);
      if (first.created) created.push({ set: entity, id });

      // 2. Read it back — an accepted write that stored nothing is the KI-52 failure.
      const back = await adapter.retrieveVersioned({ entity, id }, ['activityid', 'subject']);
      check(`${entity}: it reads back at that exact id`,
        back?.record['activityid'] === id, String(back?.record['activityid']));
      check(`${entity}: the values were stored, not merely accepted`,
        back?.record['subject'] === subject);

      // 3. The question the phase rests on: is a repeat refused?
      const repeat = await adapter.createIdempotent(entity, id, { subject: `${subject}-REPEAT` });
      check(`${entity}: a repeat at the same id is refused, not duplicated`, repeat.created === false);

      // 4. And it must not have overwritten — a silent upsert would corrupt, not duplicate.
      const after = await adapter.retrieveVersioned({ entity, id }, ['activityid', 'subject']);
      check(`${entity}: the refused repeat did NOT overwrite the original`,
        after?.record['subject'] === subject, String(after?.record['subject']));

      // 5. Prove the guard is load-bearing: without If-None-Match, does a second row appear?
      const unguarded = crypto.randomUUID();
      const plain = await transport.patch(`/${entity}(${unguarded})`, { subject: mark('UNGUARDED') });
      if (plain.status < 400) created.push({ set: entity, id: unguarded });
      check(`${entity}: an unguarded PATCH to a fresh id creates a row (so the guard is what stops it)`,
        plain.status < 400, `HTTP ${plain.status}`);

      // 6. Count by subject — the authoritative check, independent of the returned flags.
      const counted = await apiGet(cfg, token, SOLUTION_NAME,
        `/${entity}?$select=activityid&$top=5&$count=true&$filter=subject eq '${subject}'`);
      check(`${entity}: exactly one row exists for the duplicated submission`,
        counted?.['@odata.count'] === 1, `${counted?.['@odata.count']} rows`);
    }
  } finally {
    console.log('\n  ── Cleanup ──');
    await cleanUp(cfg, token);
  }

  const failed = results.filter(r => !r.passed);
  console.log(`\n  ${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`    FAILED: ${f.name}`);
    console.log('\n  CONSEQUENCE: the bulk design cannot rest on upsert-by-id for this entity.');
    process.exit(1);
  }
  console.log('\n  CONCLUSION: deterministic per-recipient ids are a sound basis for bulk idempotency.');
}

/**
 * Removes every row this spike created, by id.
 *
 * By id rather than by marker: these are native activity entities that the `SMOKE-` cleaner does not
 * cover, and leaving inert fax rows behind would be residue even though none of them can send.
 */
async function cleanUp(cfg: { apiBase: string }, token: string): Promise<void> {
  let removed = 0;
  let failedToRemove = 0;
  for (const row of created) {
    const res = await fetch(`${cfg.apiBase}/${row.set}(${row.id})`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
    });
    res.ok ? removed++ : failedToRemove++;
  }
  check('every record this spike created was removed', failedToRemove === 0,
    `${removed} removed, ${failedToRemove} refused`);

  for (const set of ['faxes', 'emails']) {
    const left = await apiGet(cfg, token, SOLUTION_NAME,
      `/${set}?$select=activityid&$top=1&$count=true&$filter=startswith(subject,'SMOKE-P7IDEM-')`);
    check(`zero SMOKE-P7IDEM residue in ${set}`, left?.['@odata.count'] === 0, `${left?.['@odata.count']} rows`);
  }
}

main().catch(error => {
  console.error('\n  FATAL:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
