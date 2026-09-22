/**
 * qa-seed-history.mts
 * Creates enough native communication history on the validation case to exercise paging.
 *
 * The unified history pages at 20 entries. `DEMO-HL-1001` holds five, so "Show more" never appears
 * and Gate 7.4 could only be marked blocked — which would be marking a gate blocked because the
 * dataset was small, not because the behaviour could not be tested.
 *
 * So this seeds a controlled mix: SMS (a Fax row with no WhatsApp template), WhatsApp (a Fax row
 * **with** one, which is QDB's own discriminator) and Email. Mixed on purpose — a paging test over
 * one channel would not exercise the watermark merge, which is the part that can reorder rows.
 *
 * **Every id is derived**, from a QA namespace and the row's index, so cleanup is by id rather than
 * by searching for text the platform composed. That is the KI-73 lesson: a cleaner that matches on
 * display text looks in the wrong place and reports success over survivors.
 *
 * `--clean` removes exactly the ids this script would create, and verifies none remain.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/qa-seed-history.mts [--clean]
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { uuidV5 } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const CASE_ID = '3d308af1-acb3-f111-aaac-000d3abd8313';
const CONTACT_ID = '2d49edea-acb3-f111-aaac-000d3abd8313';

/** A namespace of this fixture's own, so no derived id can collide with a real communication. */
const QA_NAMESPACE = '0b7d1f42-3c96-4a58-9e21-7f5c4d8a6b30';

const SMS_COUNT = 10;
const WHATSAPP_COUNT = 8;
const EMAIL_COUNT = 8;

const cleaning = process.argv.includes('--clean');

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

interface Seeded { set: 'faxes' | 'emails'; id: string; index: number; kind: string }

/** The full set of ids this fixture owns — computed, never discovered. */
function ownedRows(): Seeded[] {
  const rows: Seeded[] = [];
  for (let index = 0; index < SMS_COUNT; index++) {
    rows.push({ set: 'faxes', id: uuidV5(`qa-paging|sms|${index}`, QA_NAMESPACE), index, kind: 'SMS' });
  }
  for (let index = 0; index < WHATSAPP_COUNT; index++) {
    rows.push({ set: 'faxes', id: uuidV5(`qa-paging|whatsapp|${index}`, QA_NAMESPACE), index, kind: 'WhatsApp' });
  }
  for (let index = 0; index < EMAIL_COUNT; index++) {
    rows.push({ set: 'emails', id: uuidV5(`qa-paging|email|${index}`, QA_NAMESPACE), index, kind: 'Email' });
  }
  return rows;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised for ${AUTHORISED_ORG} only, connected to ${host}`);
  }
  console.log(`=== ${cleaning ? 'Removing' : 'Seeding'} QA paging history on ${host} ===\n`);

  const token = await acquireToken(cfg);
  const rows = ownedRows();

  if (cleaning) {
    let removed = 0;
    for (const row of rows) {
      const response = await fetch(`${cfg.apiBase}/${row.set}(${row.id})`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
      });
      if (response.ok) removed++;
    }
    console.log(`  ${removed} of ${rows.length} owned rows removed (already-absent rows report 404)\n`);
    await verifyAbsent(cfg, token, rows);
  } else {
    for (const row of rows) await createRow(cfg, token, row);
    console.log(`  ${rows.length} rows created\n`);
    await verifyPresent(cfg, token, rows);
  }

  const failed = results.filter(r => !r.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  if (failed.length > 0) process.exit(1);
}

/**
 * Creates one row at its derived id, and attaches its recipient.
 *
 * The party is a separate POST to the collection-valued navigation property — the activity's own
 * payload will not take it (KI-85). A row without one would not be a communication, and seeding
 * half-made rows would make the paging test operate on data the product itself calls incomplete.
 */
async function createRow(cfg: { apiBase: string }, token: string, row: Seeded): Promise<void> {
  const isFax = row.set === 'faxes';
  const subject = `QA-PAGING ${row.kind} ${String(row.index).padStart(2, '0')}`;

  const payload: Record<string, unknown> = isFax
    ? {
      subject,
      faxnumber: '+97400000000',
      qdb_message_body: `Synthetic QA paging row ${row.kind} ${row.index}.`,
      ...(row.kind === 'WhatsApp' ? { qdb_whatsapptemplate: 'QA_PAGING_TEMPLATE' } : {}),
      'regardingobjectid_qdb_collectioncase_fax@odata.bind': `/qdb_collectioncases(${CASE_ID})`,
    }
    : {
      subject,
      description: `Synthetic QA paging row Email ${row.index}.`,
      'regardingobjectid_qdb_collectioncase_email@odata.bind': `/qdb_collectioncases(${CASE_ID})`,
    };

  const created = await fetch(`${cfg.apiBase}/${row.set}(${row.id})`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'OData-Version': '4.0', 'OData-MaxVersion': '4.0',
      'If-None-Match': '*',
    },
    body: JSON.stringify(payload),
  });
  if (!created.ok && created.status !== 412) {
    throw new Error(`create ${row.set}(${row.id}): ${created.status} ${(await created.text()).slice(0, 200)}`);
  }

  const collection = isFax ? 'fax_activity_parties' : 'email_activity_parties';
  const party = await fetch(`${cfg.apiBase}/${row.set}(${row.id})/${collection}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'OData-Version': '4.0', 'OData-MaxVersion': '4.0',
    },
    body: JSON.stringify({
      'partyid_contact@odata.bind': `/contacts(${CONTACT_ID})`,
      participationtypemask: 2,
    }),
  });
  if (!party.ok) {
    throw new Error(`party for ${row.id}: ${party.status} ${(await party.text()).slice(0, 200)}`);
  }
}

async function verifyPresent(cfg: unknown, token: string, rows: Seeded[]): Promise<void> {
  for (const set of ['faxes', 'emails'] as const) {
    const expected = rows.filter(r => r.set === set).length;
    const found = await apiGet(cfg, token, SOLUTION_NAME,
      `/${set}?$select=activityid&$count=true&$top=1&$filter=_regardingobjectid_value eq ${CASE_ID}`);
    check(`${set} on the case`, Number(found?.['@odata.count']) >= expected,
      `${found?.['@odata.count']} (at least ${expected} expected)`);
  }

  const total = await totalOnCase(cfg, token);
  check('the case now holds more than one page of history', total > 20, `${total} entries`);
}

async function verifyAbsent(cfg: unknown, token: string, rows: Seeded[]): Promise<void> {
  const survivors: string[] = [];
  for (const row of rows) {
    const found = await apiGet(cfg, token, SOLUTION_NAME, `/${row.set}(${row.id})?$select=activityid`)
      .catch(() => null);
    if (found) survivors.push(`${row.set}(${row.id})`);
  }
  check('every owned QA row is gone, checked by id', survivors.length === 0,
    survivors.length === 0 ? `${rows.length} ids verified absent` : survivors.slice(0, 3).join(', '));

  // A marker sweep as a second net only — never as the evidence (KI-73).
  for (const set of ['faxes', 'emails'] as const) {
    const left = await apiGet(cfg, token, SOLUTION_NAME,
      `/${set}?$select=activityid&$count=true&$top=1&$filter=startswith(subject,'QA-PAGING')`);
    check(`no QA-PAGING residue by marker in ${set}`, left?.['@odata.count'] === 0,
      `${left?.['@odata.count']} rows`);
  }
}

async function totalOnCase(cfg: unknown, token: string): Promise<number> {
  let total = 0;
  for (const [set, field] of [['faxes', '_regardingobjectid_value'], ['emails', '_regardingobjectid_value'],
    ['qdb_collectionactivities', '_qdb_collectioncaseid_value']] as const) {
    const found = await apiGet(cfg, token, SOLUTION_NAME,
      `/${set}?$select=activityid&$count=true&$top=1&$filter=${field} eq ${CASE_ID}`);
    total += Number(found?.['@odata.count'] ?? 0);
  }
  return total;
}

main().catch((error: unknown) => {
  console.error('\n[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
