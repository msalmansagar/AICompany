/**
 * qa-seed-concerns.mts
 * Fixtures for the Dispute/Complaint browser gate, and their removal.
 *
 * Three shapes on one case, because the screen can only be judged when all three are present:
 *
 *   1. **A Collection Dispute** — a concern activity with no Complaint behind it.
 *   2. **A formal Customer Complaint against a BFD account** — an activity linked to a real Case.
 *   3. **A formal Customer Complaint against an HL contact** — proving the polymorphic customer,
 *      with no conversion to an account.
 *
 * Every record is created at an id derived from the activity, so cleanup is by identity and a
 * re-run is idempotent rather than duplicating.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/qa-seed-concerns.mts [--clean]
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { complaintCaseId, resolveComplaintCaseType } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const CASE_NUMBER = 'DEMO-BFD-1000';
const SUBJECT_PREFIX = 'QA-CONCERN';

/** Fixed activity ids; the Case ids are derived from them. */
const DISPUTE_ACTIVITY = 'b7c1d2e3-2001-4f00-9a00-0000000000c1';
const BFD_COMPLAINT_ACTIVITY = 'b7c1d2e3-2002-4f00-9a00-0000000000c2';
const HL_COMPLAINT_ACTIVITY = 'b7c1d2e3-2003-4f00-9a00-0000000000c3';

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

async function withGuardDisabled(
  cfg: Config, token: string, operation: () => Promise<void>,
): Promise<boolean> {
  const steps = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'qdb_collectionactivity')");
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
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'qdb_collectionactivity')");
  return restored.value.every(step => Number(step['statecode']) === 0);
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
  } else {
    await seed(cfg, token);
  }

  const failed = results.filter(result => !result.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

async function seed(cfg: Config, token: string): Promise<void> {
  // The discriminator is resolved from metadata here too — the script must not know the number.
  const meta = await get<Record<string, unknown>>(cfg, token,
    "/EntityDefinitions(LogicalName='incident')/Attributes(LogicalName='casetypecode')"
    + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet');
  const options = ((meta['OptionSet'] as {
    Options?: { Value: number; Label?: { UserLocalizedLabel?: { Label?: string } } }[];
  })?.Options ?? []).map(option => ({
    value: option.Value, label: option.Label?.UserLocalizedLabel?.Label ?? '',
  }));
  const resolution = resolveComplaintCaseType(options);
  require_('the Complaint case type resolves from live metadata', resolution.resolved,
    resolution.resolved ? `casetypecode = ${resolution.value}` : resolution.reason);
  const caseTypeCode = resolution.resolved ? resolution.value : 0;

  const cases = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectioncases?$select=qdb_collectioncaseid,_qdb_customerid_value'
    + `&$filter=qdb_casenumber eq '${CASE_NUMBER}'&$top=1`);
  const caseId = String(cases.value[0]?.['qdb_collectioncaseid']);
  const accountId = String(cases.value[0]?.['_qdb_customerid_value']);
  require_(`the synthetic case ${CASE_NUMBER} exists with an account customer`,
    Boolean(cases.value[0]), accountId);

  const contacts = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/contacts?$select=contactid,fullname&$filter=startswith(governmentid,'DEMO-')&$top=1");
  const contactId = String(contacts.value[0]?.['contactid']);
  require_('a synthetic HL contact exists', Boolean(contacts.value[0]),
    String(contacts.value[0]?.['fullname']));

  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid,qdb_name,qdb_code'
    + "&$filter=qdb_isactive eq true and endswith(qdb_code,'-DISPUTE')&$top=1");
  const typeId = String(types.value[0]?.['qdb_collectionactivitytypeid']);
  require_('the dispute/complaint activity type exists', Boolean(types.value[0]),
    `${types.value[0]?.['qdb_name']} (${types.value[0]?.['qdb_code']})`);

  const activity = (id: string, subject: string) => write(cfg, token, 'PATCH',
    `/qdb_collectionactivities(${id})`, {
      subject,
      'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseId})`,
      'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${typeId})`,
    }, { 'If-None-Match': '*' });

  const dispute = await activity(DISPUTE_ACTIVITY,
    `${SUBJECT_PREFIX} customer contests the March arrears`);
  check('a Collection Dispute activity exists, with no Complaint behind it',
    dispute < 400 || dispute === 412, `status ${dispute}`);

  for (const shape of [
    { id: BFD_COMPLAINT_ACTIVITY, book: 'BFD', bind: 'customerid_account', set: 'accounts', who: accountId },
    { id: HL_COMPLAINT_ACTIVITY, book: 'HL', bind: 'customerid_contact', set: 'contacts', who: contactId },
  ]) {
    const created = await activity(shape.id, `${SUBJECT_PREFIX} ${shape.book} complaint raised`);
    check(`a ${shape.book} complaint activity exists`, created < 400 || created === 412,
      `status ${created}`);

    // The Case id is DERIVED from the activity — the same contract the officer path uses.
    const caseRecordId = complaintCaseId(shape.id);
    const complaint = await write(cfg, token, 'PATCH', `/incidents(${caseRecordId})`, {
      title: `${SUBJECT_PREFIX} ${shape.book} complaint about collection handling`,
      casetypecode: caseTypeCode,
      [`${shape.bind}@odata.bind`]: `/${shape.set}(${shape.who})`,
    }, { 'If-None-Match': '*' });
    check(`  a formal Complaint Case exists for ${shape.book}`,
      complaint < 400 || complaint === 412, `status ${complaint}`);

    const linked = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${shape.id})`,
      { 'qdb_complaintcaseid_qdb_collectionactivity@odata.bind': `/incidents(${caseRecordId})` });
    check(`  and the activity is linked to it`, linked < 400, `status ${linked}`);
  }

  // The case must be untouched by any of this — §12.
  const collectionCase = await get<Record<string, unknown>>(cfg, token,
    `/qdb_collectioncases(${caseId})?$select=qdb_collectionpaused,qdb_currentdpd,qdb_currenttotalarrears,statuscode`);
  check('the collection case was NOT paused by any of this',
    collectionCase['qdb_collectionpaused'] !== true,
    String(collectionCase['qdb_collectionpaused']));
  console.log(`  case unchanged: dpd=${collectionCase['qdb_currentdpd']} `
    + `arrears=${collectionCase['qdb_currenttotalarrears']} status=${collectionCase['statuscode']}`);

  console.log('\n  Fixtures in place for browser QA. Run with --clean afterwards.');
}

async function cleanup(cfg: Config, token: string): Promise<void> {
  console.log('─── Cleanup (by fixture-owned id, then verified) ───');

  const restored = await withGuardDisabled(cfg, token, async () => {
    for (const id of [DISPUTE_ACTIVITY, BFD_COMPLAINT_ACTIVITY, HL_COMPLAINT_ACTIVITY]) {
      console.log(`  [DELETE activity] ${id} -> ${await write(cfg, token, 'DELETE', `/qdb_collectionactivities(${id})`)}`);
    }
  });
  for (const id of [BFD_COMPLAINT_ACTIVITY, HL_COMPLAINT_ACTIVITY]) {
    const caseRecordId = complaintCaseId(id);
    console.log(`  [DELETE complaint] ${caseRecordId} -> ${await write(cfg, token, 'DELETE', `/incidents(${caseRecordId})`)}`);
  }

  check('the immutability guard is enabled exactly as before', restored);

  const activityResidue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$count=true&$filter=startswith(subject,'${SUBJECT_PREFIX}')`);
  check('zero activity residue remains', (activityResidue['@odata.count'] ?? 0) === 0,
    `${activityResidue['@odata.count'] ?? 0} row(s)`);

  const complaintResidue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/incidents?$select=incidentid&$count=true&$filter=startswith(title,'${SUBJECT_PREFIX}')`);
  check('zero Complaint residue remains', (complaintResidue['@odata.count'] ?? 0) === 0,
    `${complaintResidue['@odata.count'] ?? 0} row(s)`);
}

await main();
