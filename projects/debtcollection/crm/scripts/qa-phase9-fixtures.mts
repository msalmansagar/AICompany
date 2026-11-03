/**
 * qa-phase9-fixtures.mts
 * The two records Phase 9 browser QA needs, on one synthetic DEMO case — and their removal.
 *
 * The Workout & Legal tab shows a card only where the case has something for it, and no case on
 * org5869857f holds a Legal Recommendation or a dispute at all. So browser QA seeds exactly two
 * activities on `DEMO-HL-1001`, beside the deceased indication `smoke-deceased-review.mts
 * --seed-only` places there:
 *
 *   - a Legal Recommendation with **no** Litigation Request — no `qdb_qdblegal` record is created;
 *   - a Collection Dispute with **no** Complaint link — no `incident` is created.
 *
 * Both are created at fixed ids this script owns, with `If-None-Match: *` so a re-run cannot
 * duplicate them, and removed by those ids. `--clean` re-reads each id to prove it has gone.
 * ARR is never touched.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/qa-phase9-fixtures.mts --seed|--clean
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const CASE_NUMBER = 'DEMO-HL-1001';

const FIXTURES = [
  { id: 'c9a2b3c4-9001-4f00-9a00-0000000000a1', typeCode: 'P6-LEGALREC', subject: 'QA-P9 Legal recommendation' },
  { id: 'c9a2b3c4-9002-4f00-9a00-0000000000a2', typeCode: 'P6-DISPUTE', subject: 'QA-P9 Disputed arrears amount' },
] as const;

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
  console.error('\n[ABORT] A fixture this run depends on is unavailable.');
  process.exit(1);
};

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

async function send(
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

async function caseId(cfg: Config, token: string): Promise<string> {
  const cases = await get<{ value: Row[] }>(cfg, token,
    `/qdb_collectioncases?$select=qdb_collectioncaseid&$filter=qdb_casenumber eq '${CASE_NUMBER}'&$top=1`);
  return String(cases.value[0]?.['qdb_collectioncaseid'] ?? '');
}

async function typeId(cfg: Config, token: string, code: string): Promise<string> {
  const types = await get<{ value: Row[] }>(cfg, token,
    `/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid&$filter=qdb_code eq '${code}'&$top=1`);
  return String(types.value[0]?.['qdb_collectionactivitytypeid'] ?? '');
}

async function seed(cfg: Config, token: string): Promise<void> {
  const collectionCaseId = await caseId(cfg, token);
  require_(`the synthetic case ${CASE_NUMBER} exists`, Boolean(collectionCaseId), collectionCaseId);

  for (const fixture of FIXTURES) {
    const activityTypeId = await typeId(cfg, token, fixture.typeCode);
    require_(`${fixture.typeCode} resolves by code`, Boolean(activityTypeId), activityTypeId);
    const status = await send(cfg, token, 'PATCH', `/qdb_collectionactivities(${fixture.id})`, {
      subject: fixture.subject,
      'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${collectionCaseId})`,
      'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${activityTypeId})`,
    }, { 'If-None-Match': '*' });
    check(`${fixture.subject} is in place at its owned id`, status < 400 || status === 412, `status ${status}`);
  }
  console.log('\n  Fixtures LEFT IN PLACE for browser QA. Run with --clean afterwards.');
}

async function clean(cfg: Config, token: string): Promise<void> {
  for (const fixture of FIXTURES) {
    const status = await send(cfg, token, 'DELETE', `/qdb_collectionactivities(${fixture.id})`);
    check(`${fixture.subject} deleted, or already absent`, status < 400 || status === 404, `status ${status}`);
    const reread = await send(cfg, token, 'GET', `/qdb_collectionactivities(${fixture.id})?$select=activityid`);
    check(`${fixture.subject} re-reads as gone`, reread === 404, `status ${reread}`);
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  require_('Running against the authorised organisation only', cfg.orgUrl.includes(AUTHORISED_ORG), cfg.orgUrl);
  const token = await acquireToken(cfg as never);

  if (process.argv.includes('--seed')) await seed(cfg, token);
  else if (process.argv.includes('--clean')) await clean(cfg, token);
  else require_('One of --seed or --clean is given', false);

  const failed = results.filter(result => !result.passed).length;
  console.log(`\n=== ${results.length - failed}/${results.length} checks passed ===`);
  process.exit(failed ? 1 : 0);
}

main().catch(error => { console.error(error); process.exit(1); });
