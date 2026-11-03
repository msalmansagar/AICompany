/**
 * smoke-phase9-advanced.mts
 * Phase 9 against real Dataverse — READ-ONLY. It creates, changes and deletes nothing.
 *
 * Proves three things the workspace now tells an officer, from the organisation rather than from a
 * fake:
 *
 *   1. **The conclusion dependency is live (KI-131).** The outcome catalogue for the Legal,
 *      Deceased and Dispute types is read and counted, and the capability matrix is derived from
 *      that count by the same domain rule the workspace uses. Whatever the count is, the matrix
 *      must agree with it — the check is the derivation, not a hope that the count is zero.
 *   2. **The Legal hand-off stays blocked.** The workspace's qualification policy is empty, and the
 *      domain's own predicate answers that it is not configured (KI-109).
 *   3. **A case card's page tells the truth about "more" (WP8).** The busiest case on the whole
 *      organisation is found for Legal and for dispute work, and the card's exact read — the same
 *      filter, 100 rows — is issued against it. It must report more exactly when the case holds
 *      more than a page. ARR is only read.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-phase9-advanced.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { describeAdvancedProcesses, isQualificationConfigured } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
/** The card's page size, `CASE_CARD_PAGE_SIZE` in the workspace. */
const CARD_PAGE_SIZE = 100;
const TYPE_CODES = { legal: 'P6-LEGALREC', deceased: 'P6-DECEASED', dispute: 'P6-DISPUTE' } as const;

interface Config { apiBase: string; orgUrl: string }
type Row = Record<string, unknown>;

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const require_ = (name: string, passed: boolean, detail = ''): void => {
  check(name, passed, detail);
  if (passed) return;
  console.error('\n[ABORT] A fact this run depends on is unavailable.');
  process.exit(1);
};

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

/** Reads with the platform's own page size and follows every `nextLink` — `$top` would hide them. */
async function readAll(cfg: Config, token: string, path: string): Promise<Row[]> {
  const rows: Row[] = [];
  let next: string | undefined = `${cfg.apiBase}${path}`;
  while (next) {
    const response = await fetch(next, {
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/json',
        'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'odata.maxpagesize=5000',
      },
    });
    if (!response.ok) throw new Error(`read failed ${response.status}: ${await response.text()}`);
    const body = await response.json() as { value: Row[]; '@odata.nextLink'?: string };
    rows.push(...body.value);
    next = body['@odata.nextLink'];
  }
  return rows;
}

/** The card's own read: one page of the given size, reporting only whether the platform says more. */
async function cardPageSaysMore(cfg: Config, token: string, filter: string): Promise<boolean> {
  const response = await fetch(
    `${cfg.apiBase}/qdb_collectionactivities?$select=activityid&$orderby=createdon desc&$filter=${encodeURIComponent(filter)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/json',
        'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: `odata.maxpagesize=${CARD_PAGE_SIZE}`,
      },
    },
  );
  if (!response.ok) throw new Error(`card read failed ${response.status}`);
  const body = await response.json() as { '@odata.nextLink'?: string };
  return body['@odata.nextLink'] !== undefined;
}

async function typeIds(cfg: Config, token: string): Promise<Record<keyof typeof TYPE_CODES, string>> {
  const types = await get<{ value: Row[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid,qdb_code');
  const idFor = (code: string) =>
    String(types.value.find(type => String(type['qdb_code'] ?? '').toUpperCase() === code)?.['qdb_collectionactivitytypeid'] ?? '');
  return { legal: idFor(TYPE_CODES.legal), deceased: idFor(TYPE_CODES.deceased), dispute: idFor(TYPE_CODES.dispute) };
}

async function outcomeCount(cfg: Config, token: string, typeId: string): Promise<number> {
  const rows = await readAll(cfg, token,
    `/qdb_activityoutcomes?$select=qdb_activityoutcomeid&$filter=_qdb_activitytypeid_value eq ${typeId}`);
  return rows.length;
}

/** The busiest case for a clause, counted across the whole organisation, read-only. */
async function busiestCase(cfg: Config, token: string, clause: string): Promise<{ caseId: string; count: number }> {
  const rows = await readAll(cfg, token,
    `/qdb_collectionactivities?$select=_qdb_collectioncaseid_value&$filter=_qdb_collectioncaseid_value ne null and (${clause})`);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const caseId = String(row['_qdb_collectioncaseid_value']);
    counts.set(caseId, (counts.get(caseId) ?? 0) + 1);
  }
  const [caseId, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return { caseId, count };
}

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  require_('Running against the authorised organisation only', cfg.orgUrl.includes(AUTHORISED_ORG), cfg.orgUrl);
  const token = await acquireToken(cfg as never);

  console.log('\n─── 1. The conclusion dependency, from the live catalogue ───');
  const ids = await typeIds(cfg, token);
  require_('All three advanced-process types resolve by code',
    Boolean(ids.legal && ids.deceased && ids.dispute), JSON.stringify(ids));
  const counts = {
    legal: await outcomeCount(cfg, token, ids.legal),
    deceased: await outcomeCount(cfg, token, ids.deceased),
    dispute: await outcomeCount(cfg, token, ids.dispute),
  };
  console.log(`      live outcome counts: ${JSON.stringify(counts)}`);
  const matrix = describeAdvancedProcesses({ outcomeCounts: counts, legalQualificationConfigured: false });
  for (const process of ['legal', 'deceased', 'dispute'] as const) {
    const expected = counts[process] > 0 ? 'Actionable' : 'ConfigurationDependent';
    const actual = matrix.find(row => row.id === `${process}-conclude`)?.capability;
    check(`${process}: the matrix agrees with ${counts[process]} configured outcome(s)`, actual === expected, `${actual}`);
  }

  console.log('\n─── 2. The Legal hand-off ───');
  check('The workspace policy is not a qualification rule', !isQualificationConfigured({}));
  check('So the hand-off is blocked', matrix.find(row => row.id === 'legal-handoff')?.capability === 'Blocked');

  console.log('\n─── 3. A card page tells the truth about "more" — read-only, whole organisation ───');
  const clauses = {
    legal: `_qdb_legalrequestid_value ne null or _qdb_activitytypeid_value eq ${ids.legal}`,
    dispute: `_qdb_complaintcaseid_value ne null or _qdb_activitytypeid_value eq ${ids.dispute}`,
  };
  for (const [name, clause] of Object.entries(clauses)) {
    const busiest = await busiestCase(cfg, token, clause);
    console.log(`      ${name}: busiest case holds ${busiest.count} (${busiest.caseId || 'none'})`);
    if (!busiest.caseId) {
      // Not a pass: with nothing to page, the check could not have failed. Reported apart from the
      // totals, and the behaviour stays proven by the component tests alone.
      console.log(`  NOT EXERCISED  ${name}: no case on this organisation holds such work`);
      continue;
    }
    const saysMore = await cardPageSaysMore(cfg, token,
      `_qdb_collectioncaseid_value eq ${busiest.caseId} and (${clause})`);
    check(`${name}: the card's page reports more exactly when the case holds more than ${CARD_PAGE_SIZE}`,
      saysMore === busiest.count > CARD_PAGE_SIZE, `count ${busiest.count}, more=${saysMore}`);
  }

  const failed = results.filter(result => !result.passed).length;
  console.log(`\n=== ${results.length - failed}/${results.length} checks passed — nothing was written ===`);
  process.exit(failed ? 1 : 0);
}

main().catch(error => { console.error(error); process.exit(1); });
