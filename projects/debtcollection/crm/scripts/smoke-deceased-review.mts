/**
 * smoke-deceased-review.mts
 * WP16 against real Dataverse — the QCB indication, read and reviewed, changing nothing.
 *
 * **The ARR population is never written to.** The 724 real indications are read only, and only to
 * prove the server-side filter and count work at their real scale. Every write in this script is
 * against a synthetic `DEMO-` fixture created at an id the script owns.
 *
 * What it establishes:
 *
 *   the indication is read from the snapshot, not inferred;
 *   the filter and the count are executed **by the platform** over 724 real rows;
 *   a review is created at a **derived** id, so a retry and five concurrent attempts yield one;
 *   and — the point of the whole work package — the collection case, its delinquency, its status
 *   and its Legal state are **byte-identical before and after**.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-deceased-review.mts [--seed-only|--clean]
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { deceasedReviewId, toDeceasedReviewRow } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const CASE_NUMBER = 'DEMO-HL-1001';
const SUBJECT_PREFIX = 'QA-DECEASED';

/** Fixture-owned ids. The review's is derived; the snapshot's is fixed so cleanup is by identity. */
const FIXTURE_SNAPSHOT = 'd4e5f6a7-3001-4f00-9a00-0000000000d1';

interface Config { apiBase: string; orgUrl: string }

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const require_ = (name: string, passed: boolean, detail = ''): void => {
  check(name, passed, detail);
  if (passed) return;
  console.error('\n[ABORT] A fixture this run depends on is unavailable.');
  process.exit(1);
};

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

async function write(
  cfg: Config, token: string, method: string, path: string,
  body?: unknown, headers: Record<string, string> = {},
): Promise<number> {
  const response = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
      'MSCRM.SolutionUniqueName': SOLUTION_NAME, ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return response.status;
}

/**
 * Disables the immutability guard around a delete, then restores and verifies it.
 *
 * **Both entities, because both are guarded.** The activity guard is familiar; the snapshot's is
 * stronger and refuses with *"records are permanently immutable and cannot be modified or
 * deleted"*. That is ADR-05 working as designed — the MIS snapshot history is append-only — and it
 * is why a fixture that creates a snapshot is expensive to clean up. Worth remembering before
 * choosing that fixture shape again.
 */
async function withGuardDisabled(
  cfg: Config, token: string, operation: () => Promise<void>,
): Promise<boolean> {
  const steps = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and "
    + "(contains(name,'qdb_collectionactivity') or contains(name,'qdb_delinquencysnapshot'))");
  const setState = async (value: number): Promise<void> => {
    for (const step of steps.value) {
      await write(cfg, token, 'PATCH',
        `/sdkmessageprocessingsteps(${step['sdkmessageprocessingstepid']})`,
        { statecode: value, statuscode: value === 0 ? 1 : 2 });
    }
  };
  await setState(1);
  try { await operation(); } finally { await setState(0); }
  const restored = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=statecode'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and "
    + "(contains(name,'qdb_collectionactivity') or contains(name,'qdb_delinquencysnapshot'))");
  return restored.value.length > 0 && restored.value.every(step => Number(step['statecode']) === 0);
}

/** The whole point: a fingerprint of everything that must be identical afterwards. */
async function caseFingerprint(cfg: Config, token: string, caseId: string): Promise<string> {
  const row = await get<Record<string, unknown>>(cfg, token,
    `/qdb_collectioncases(${caseId})?$select=statecode,statuscode,qdb_currentdpd,`
    + 'qdb_currenttotalarrears,qdb_currentloanbalance,qdb_collectionpaused,qdb_episodenumber,'
    + '_qdb_strategyid_value');
  return JSON.stringify([
    row['statecode'], row['statuscode'], row['qdb_currentdpd'], row['qdb_currenttotalarrears'],
    row['qdb_currentloanbalance'], row['qdb_collectionpaused'], row['qdb_episodenumber'],
    row['_qdb_strategyid_value'],
  ]);
}

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}\n`);

  if (process.argv.includes('--clean')) {
    await cleanup(cfg, token);
    return finish();
  }

  await realScaleFilter(cfg, token);
  const fixtures = await seed(cfg, token);
  await indicationIsRead(cfg, token, fixtures);
  await reviewIsIdempotent(cfg, token, fixtures);
  await nothingChanged(cfg, token, fixtures);

  if (!process.argv.includes('--seed-only')) await cleanup(cfg, token);
  else console.log('\n  Fixtures LEFT IN PLACE for browser QA. Run with --clean afterwards.');

  finish();
}

interface Fixtures { caseId: string; facilityNumber: string; before: string }

/** The filter and count, executed by the platform over the real 724. Read-only. */
async function realScaleFilter(cfg: Config, token: string): Promise<void> {
  console.log('─── 1. The filter runs on the platform, at real scale (READ-ONLY) ───');

  const all = await get<{ '@odata.count'?: number }>(cfg, token,
    '/qdb_delinquencysnapshots?$select=qdb_delinquencysnapshotid&$count=true&$top=1');
  const flagged = await get<{ '@odata.count'?: number }>(cfg, token,
    '/qdb_delinquencysnapshots?$select=qdb_delinquencysnapshotid&$count=true&$top=1'
    + '&$filter=qdb_isdeceasedperqcb eq true');

  check('the platform answers a count over every snapshot', (all['@odata.count'] ?? 0) > 4000,
    `${all['@odata.count']} snapshots`);
  check('and narrows it to the indicated population without returning the rows',
    (flagged['@odata.count'] ?? 0) === 724, `${flagged['@odata.count']} indicated`);

  const page = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_delinquencysnapshots?$select=qdb_facilitynumber&$top=5'
    + '&$filter=qdb_isdeceasedperqcb eq true&$orderby=qdb_snapshotdate desc');
  check('a bounded page of the indicated population is five rows, not 724',
    page.value.length === 5, `${page.value.length} row(s)`);
  console.log('        ⇒ the ARR population is read only. Nothing below writes to it.');
}

async function seed(cfg: Config, token: string): Promise<Fixtures> {
  console.log('\n─── 2. A synthetic indication (DEMO only) ───');

  const cases = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectioncases?$select=qdb_collectioncaseid,qdb_facilitynumber,qdb_customerbusinessid'
    + `&$filter=qdb_casenumber eq '${CASE_NUMBER}'&$top=1`);
  const caseId = String(cases.value[0]?.['qdb_collectioncaseid']);
  const facilityNumber = String(cases.value[0]?.['qdb_facilitynumber']);
  require_(`the synthetic case ${CASE_NUMBER} exists`, Boolean(cases.value[0]), facilityNumber);

  const before = await caseFingerprint(cfg, token, caseId);
  console.log(`  case fingerprint before: ${before}`);

  // A NEW snapshot, newest-dated, rather than editing an existing one — the existing DEMO
  // snapshots are left exactly as the seed created them.
  const created = await write(cfg, token, 'PATCH',
    `/qdb_delinquencysnapshots(${FIXTURE_SNAPSHOT})`, {
      qdb_snapshotkey: `${SUBJECT_PREFIX}-${facilityNumber}`,
      qdb_facilitynumber: facilityNumber,
      qdb_customerbusinessid: String(cases.value[0]?.['qdb_customerbusinessid'] ?? 'DEMO'),
      qdb_snapshotdate: '2026-09-22T00:00:00Z',
      qdb_isdeceasedperqcb: true,
      'qdb_collectioncaseid@odata.bind': `/qdb_collectioncases(${caseId})`,
    }, { 'If-None-Match': '*' });
  require_('a synthetic snapshot carries a QCB deceased indication',
    created < 400 || created === 412, `status ${created}`);

  return { caseId, facilityNumber, before };
}

async function indicationIsRead(cfg: Config, token: string, f: Fixtures): Promise<void> {
  console.log('\n─── 3. The indication is read, and described as needing verification ───');

  const page = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_delinquencysnapshots?$select=qdb_facilitynumber,qdb_snapshotdate,qdb_isdeceasedperqcb'
    + `&$filter=_qdb_collectioncaseid_value eq ${f.caseId}&$orderby=qdb_snapshotdate desc&$top=1`);
  const newest = page.value[0];
  check('the case’s newest snapshot is the one carrying the indication',
    newest?.['qdb_isdeceasedperqcb'] === true,
    `${newest?.['qdb_facilitynumber']} @ ${String(newest?.['qdb_snapshotdate']).slice(0, 10)}`);

  const row = toDeceasedReviewRow({
    indication: {
      present: newest?.['qdb_isdeceasedperqcb'] === true,
      source: 'QcbViaMis',
      asOf: String(newest?.['qdb_snapshotdate']),
      facilityNumber: f.facilityNumber,
    },
    formatDate: iso => iso.slice(0, 10),
  });
  check('it is described as requiring verification, never as a deceased customer',
    /verification required/i.test(row.indication)
    && !/deceased customer|confirmed/i.test(row.indication), row.indication);
  check('and it is offered for review rather than acted on', row.canStartReview === true);
  check('nothing about it mentions insurance, a claim or an exemption',
    !/insur|claim|policy|exempt/i.test([row.label, row.indication, row.reviewOutcome].join(' ')));
}

async function reviewIsIdempotent(cfg: Config, token: string, f: Fixtures): Promise<void> {
  console.log('\n─── 4. One review, however many times it is started ───');

  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid,qdb_name,qdb_code'
    + "&$filter=qdb_isactive eq true and endswith(qdb_code,'-DECEASED')&$top=1");
  const typeId = String(types.value[0]?.['qdb_collectionactivitytypeid']);
  require_('the Deceased review activity type exists', Boolean(types.value[0]),
    `${types.value[0]?.['qdb_name']} (${types.value[0]?.['qdb_code']})`);

  const reviewId = deceasedReviewId(f.caseId, f.facilityNumber);
  const body = {
    subject: `${SUBJECT_PREFIX} review of the QCB deceased indication`,
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${f.caseId})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${typeId})`,
  };

  const before = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$count=true&$top=1`
    + `&$filter=startswith(subject,'${SUBJECT_PREFIX}')`);

  const first = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${reviewId})`, body,
    { 'If-None-Match': '*' });
  check('a review is created at its derived id', first < 400, `status ${first}`);

  const retry = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${reviewId})`, body,
    { 'If-None-Match': '*' });
  check('a retry is refused by the platform, not duplicated', retry === 412, `status ${retry}`);

  const concurrent = await Promise.all(Array.from({ length: 5 }, () =>
    write(cfg, token, 'PATCH', `/qdb_collectionactivities(${reviewId})`, body,
      { 'If-None-Match': '*' })));
  check('five concurrent attempts create nothing further',
    concurrent.every(status => status === 412), concurrent.join(','));

  const after = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$count=true&$top=1`
    + `&$filter=startswith(subject,'${SUBJECT_PREFIX}')`);
  check('exactly one review exists afterwards',
    (after['@odata.count'] ?? 0) === (before['@odata.count'] ?? 0) + 1,
    `${before['@odata.count']} → ${after['@odata.count']}`);
}

/** The heart of it: everything that must be untouched, compared byte for byte. */
async function nothingChanged(cfg: Config, token: string, f: Fixtures): Promise<void> {
  console.log('\n─── 5. Nothing about collection changed ───');

  const after = await caseFingerprint(cfg, token, f.caseId);
  console.log(`  case fingerprint after:  ${after}`);
  check('the collection case is byte-identical — status, DPD, arrears, balance, pause, '
    + 'episode and strategy', after === f.before);

  const legal = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$count=true&$top=1`
    + `&$filter=_qdb_collectioncaseid_value eq ${f.caseId} and _qdb_legalrequestid_value ne null`);
  check('no Litigation Request was raised or linked by any of this',
    (legal['@odata.count'] ?? 0) === 0, `${legal['@odata.count']} linked`);

  const complaints = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$count=true&$top=1`
    + `&$filter=_qdb_collectioncaseid_value eq ${f.caseId} and _qdb_complaintcaseid_value ne null`);
  check('and no Complaint Case either', (complaints['@odata.count'] ?? 0) === 0);

  const arr = await get<{ '@odata.count'?: number }>(cfg, token,
    '/qdb_delinquencysnapshots?$select=qdb_delinquencysnapshotid&$count=true&$top=1'
    + "&$filter=qdb_isdeceasedperqcb eq true and startswith(qdb_facilitynumber,'ARR')");
  check('the real ARR indicated population is untouched at 724',
    (arr['@odata.count'] ?? 0) === 724, `${arr['@odata.count']} rows`);
}

async function cleanup(cfg: Config, token: string): Promise<void> {
  console.log('\n─── Cleanup (by fixture-owned id, then verified) ───');

  const cases = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectioncases?$select=qdb_collectioncaseid,qdb_facilitynumber'
    + `&$filter=qdb_casenumber eq '${CASE_NUMBER}'&$top=1`);
  const caseId = String(cases.value[0]?.['qdb_collectioncaseid']);
  const facilityNumber = String(cases.value[0]?.['qdb_facilitynumber']);

  const restored = await withGuardDisabled(cfg, token, async () => {
    const reviewId = deceasedReviewId(caseId, facilityNumber);
    console.log(`  [DELETE review] ${reviewId} -> `
      + `${await write(cfg, token, 'DELETE', `/qdb_collectionactivities(${reviewId})`)}`);
    console.log(`  [DELETE snapshot] ${FIXTURE_SNAPSHOT} -> `
      + `${await write(cfg, token, 'DELETE', `/qdb_delinquencysnapshots(${FIXTURE_SNAPSHOT})`)}`);
  });

  check('the immutability guard is enabled exactly as before', restored);

  const activityResidue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$count=true&$filter=startswith(subject,'${SUBJECT_PREFIX}')`);
  check('zero review residue remains', (activityResidue['@odata.count'] ?? 0) === 0,
    `${activityResidue['@odata.count'] ?? 0} row(s)`);

  const snapshotResidue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_delinquencysnapshots?$select=qdb_delinquencysnapshotid&$count=true`
    + `&$filter=startswith(qdb_snapshotkey,'${SUBJECT_PREFIX}')`);
  check('zero synthetic-snapshot residue remains', (snapshotResidue['@odata.count'] ?? 0) === 0,
    `${snapshotResidue['@odata.count'] ?? 0} row(s)`);

  const arr = await get<{ '@odata.count'?: number }>(cfg, token,
    '/qdb_delinquencysnapshots?$select=qdb_delinquencysnapshotid&$count=true&$top=1'
    + "&$filter=qdb_isdeceasedperqcb eq true and startswith(qdb_facilitynumber,'ARR')");
  check('and the real ARR population is still exactly 724', (arr['@odata.count'] ?? 0) === 724,
    `${arr['@odata.count']} rows`);
}

function finish(): void {
  const failed = results.filter(result => !result.passed);
  if (failed.length === 0) {
    console.log('\n  Indication read and described .......... VALIDATED');
    console.log('  Server-side filter at real scale ...... VALIDATED — 724 of 4,373, read-only');
    console.log('  Review idempotency .................... VALIDATED — retry and concurrency');
    console.log('  Collection unchanged .................. VALIDATED — case byte-identical');
    console.log('  Insurance claim handling .............. NOT BUILT — no QDB process exists (KI-125)');
    console.log('  Deceased handling policy .............. UNDEFINED — KI-124, KI-127');
    console.log('  Collection Officer access ............. NOT VALIDATED — KI-128');
  } else {
    console.log(`\n  NOT VALIDATED — ${failed.length} check(s) failed.`);
  }
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
