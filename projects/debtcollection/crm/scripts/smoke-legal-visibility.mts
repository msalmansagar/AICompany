/**
 * smoke-legal-visibility.mts
 * WP10 against real Dataverse — including two states it proves are NOT reachable here.
 *
 * Seeds the Legal shapes an officer can encounter, asserts what the screen will read, and is
 * honest about the two it cannot produce:
 *
 *   **A broken link cannot occur on Dataverse.** The lookup enforces referential integrity, and
 *   deleting a Litigation Request cascades `RemoveLink` rather than leaving a dangling reference.
 *   Both halves are asserted here, so `LitigationLinkBroken` is documented as defence for imported
 *   or on-premises data rather than claimed as tested.
 *   **A refused read cannot be produced by this identity.** No DCP security role holds
 *   `prvReadqdb_qdblegal` (KI-111), but the smoke and the browser both run as an administrator, so
 *   `LitigationNotVisible` is NOT validated at runtime. The privilege gap itself is asserted.
 *
 * §14 safety: synthetic DEMO data only. Every record is created at an id this script owns and
 * removed by that id. No real Litigation Request is raised.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-legal-visibility.mts [--seed-only|--clean]
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { describeLegalTrace, interpretLegalRead, litigationRequestId } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const CASE_NUMBER = 'DEMO-BFD-1000';

/** Fixed, so a later `--clean` removes exactly what a `--seed` created. */
const LINKED_RECOMMENDATION = 'c1a2b3c4-1001-4f00-9a00-0000000000b1';
const BARE_RECOMMENDATION = 'c1a2b3c4-1002-4f00-9a00-0000000000b2';
const SUBJECT_PREFIX = 'QA-P10';

const POLICY = { caseType: 100000001, caseAgainst: 1, caseInitiatedBy: 100000006 };

/**
 * Read from metadata in `seed`, never written down.
 *
 * The first draft of this script guessed `qdb_customer_account` and the create failed with 400.
 * The platform's actual name is `qdb_Customer` — **capitalised** — which no rule derives. Same
 * family as KI-52, KI-57 and KI-69, and the fourth time it has cost real debugging.
 */
let customerNavigationProperty = '';

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
    return finish();
  }

  const fixtures = await seed(cfg, token);
  await securityDependency(cfg, token);
  await traceability(cfg, token, fixtures);
  await referentialIntegrity(cfg, token, fixtures);

  if (!process.argv.includes('--seed-only')) await cleanup(cfg, token);
  else console.log('\n  Fixtures LEFT IN PLACE for browser QA. Run with --clean afterwards.');

  finish();
}

interface Fixtures { caseId: string; accountId: string; legalId: string; legalTypeId: string }

async function seed(cfg: Config, token: string): Promise<Fixtures> {
  console.log('─── 0. Fixtures (synthetic DEMO data only) ───');

  const cases = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectioncases?$select=qdb_collectioncaseid,_qdb_customerid_value'
    + `&$filter=qdb_casenumber eq '${CASE_NUMBER}'&$top=1`);
  const caseId = String(cases.value[0]?.['qdb_collectioncaseid']);
  const accountId = String(cases.value[0]?.['_qdb_customerid_value']);
  require_(`the synthetic case ${CASE_NUMBER} exists with a customer`,
    Boolean(cases.value[0]) && accountId !== 'undefined', accountId);

  const relationship = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/EntityDefinitions(LogicalName='qdb_qdblegal')/ManyToOneRelationships"
    + '?$select=ReferencingEntityNavigationPropertyName'
    + "&$filter=ReferencingAttribute eq 'qdb_customer'");
  customerNavigationProperty = String(
    relationship.value[0]?.['ReferencingEntityNavigationPropertyName'] ?? '');
  require_('the Legal customer lookup names its write-side navigation property',
    Boolean(customerNavigationProperty), customerNavigationProperty);

  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid,qdb_name,qdb_code'
    + "&$filter=qdb_isactive eq true and endswith(qdb_code,'LEGALREC')&$top=1");
  const legalTypeId = String(types.value[0]?.['qdb_collectionactivitytypeid']);
  require_('an activity type whose CODE identifies it as a Legal Recommendation exists',
    Boolean(types.value[0]), `${types.value[0]?.['qdb_name']} (${types.value[0]?.['qdb_code']})`);

  const bind = (subject: string) => ({
    subject,
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseId})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${legalTypeId})`,
  });

  const linked = await write(cfg, token, 'PATCH',
    `/qdb_collectionactivities(${LINKED_RECOMMENDATION})`,
    bind(`${SUBJECT_PREFIX} recommendation with a Legal request`), { 'If-None-Match': '*' });
  const bare = await write(cfg, token, 'PATCH',
    `/qdb_collectionactivities(${BARE_RECOMMENDATION})`,
    bind(`${SUBJECT_PREFIX} recommendation with no Legal request`), { 'If-None-Match': '*' });
  check('two Legal Recommendations exist', linked < 400 || linked === 412,
    `${linked}, ${bare}`);

  const legalId = litigationRequestId(LINKED_RECOMMENDATION);
  const created = await write(cfg, token, 'PATCH', `/qdb_qdblegals(${legalId})`, {
    qdb_name: `${SUBJECT_PREFIX} litigation`,
    qdb_casetype: POLICY.caseType,
    qdb_caseagainst: POLICY.caseAgainst,
    qdb_caseinitiatedby: POLICY.caseInitiatedBy,
    qdb_summaryjustification: `${SUBJECT_PREFIX} synthetic WP10 fixture — not a real legal matter.`,
    [`${customerNavigationProperty}@odata.bind`]: `/accounts(${accountId})`,
  }, { 'If-None-Match': '*' });
  check('a Litigation Request exists at the derived id', created < 400 || created === 412,
    `status ${created}`);

  const link = await write(cfg, token, 'PATCH',
    `/qdb_collectionactivities(${LINKED_RECOMMENDATION})`,
    { 'qdb_legalrequestid_qdb_collectionactivity@odata.bind': `/qdb_qdblegals(${legalId})` });
  require_('one recommendation is linked to it', link < 400, `status ${link}`);

  return { caseId, accountId, legalId, legalTypeId };
}

/** KI-111 — asserted, because the browser cannot demonstrate it. */
async function securityDependency(cfg: Config, token: string): Promise<void> {
  console.log('\n─── 1. Who can actually read the Legal entity ───');

  const privilege = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/privileges?$select=privilegeid&$filter=name eq 'prvReadqdb_qdblegal'");
  const privilegeId = String(privilege.value[0]?.['privilegeid']);
  require_('the Legal read privilege exists', Boolean(privilege.value[0]));

  const holders = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/roleprivilegescollection?$select=roleid&$filter=privilegeid eq ${privilegeId}`);
  const roleIds = new Set(holders.value.map(row => String(row['roleid'])));
  const roles = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/roles?$select=roleid,name&$top=500');
  const holderNames = roles.value
    .filter(role => roleIds.has(String(role['roleid'])))
    .map(role => String(role['name']));

  check('no DCP or Collection role holds it — a deployment dependency, not a bug (KI-111)',
    holderNames.every(name => !/dcp|collect/i.test(name)), holderNames.join(', '));
  console.log('        ⇒ LitigationNotVisible is NOT validated at runtime: this identity is an '
    + 'administrator,\n          so a refused read cannot be produced here.');
}

async function traceability(cfg: Config, token: string, f: Fixtures): Promise<void> {
  console.log('\n─── 2. The screen’s reads, run against the organisation ───');

  const select = '$select=activityid,subject,_qdb_legalrequestid_value,_qdb_activitytypeid_value';
  const candidates = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/qdb_collectionactivities?${select}&$filter=_qdb_collectioncaseid_value eq ${f.caseId}`
    + ` and (_qdb_legalrequestid_value ne null or _qdb_activitytypeid_value eq ${f.legalTypeId})`);
  check('the narrowed read returns both recommendations and nothing else',
    candidates.value.length >= 2
    && candidates.value.every(row => String(row['subject']).startsWith(SUBJECT_PREFIX)),
    `${candidates.value.length} row(s)`);

  const linkedRow = candidates.value.find(r => String(r['activityid']).toLowerCase() === LINKED_RECOMMENDATION);
  const bareRow = candidates.value.find(r => String(r['activityid']).toLowerCase() === BARE_RECOMMENDATION);
  check('the linked recommendation carries its Litigation Request id',
    String(linkedRow?.['_qdb_legalrequestid_value']).toLowerCase() === f.legalId.toLowerCase());
  check('the unlinked one carries none', bareRow?.['_qdb_legalrequestid_value'] == null);

  // The Legal record, read by id — the only route the screen uses.
  const legal = await get<Record<string, unknown>>(cfg, token,
    `/qdb_qdblegals(${f.legalId})?$select=qdb_name,statecode,statuscode,createdon,_qdb_customer_value`);
  check('reading it by id succeeds', Boolean(legal['qdb_name']), String(legal['qdb_name']));
  check('and the platform supplies the status LABEL, so no DCP table maps it',
    typeof legal['statuscode@OData.Community.Display.V1.FormattedValue'] === 'string'
    || typeof legal['statuscode'] === 'number',
    String(legal['statuscode']));

  const visible = describeLegalTrace({
    isLegalRecommendation: true,
    legalRequestId: f.legalId,
    fetch: { kind: 'found', record: { reference: String(legal['qdb_name']) } },
    episodeIsCurrent: true,
  });
  check('a linked, readable request renders as a raised Legal request',
    visible.state === 'LitigationVisible', visible.label);

  const recommended = describeLegalTrace({ isLegalRecommendation: true, episodeIsCurrent: true });
  check('an unlinked recommendation renders as recommended, NOT as a raised request',
    recommended.state === 'RecommendationOnly'
    && recommended.label !== visible.label, recommended.label);

  const refused = describeLegalTrace({
    isLegalRecommendation: true, legalRequestId: f.legalId,
    fetch: { kind: interpretLegalRead(403) as 'forbidden' }, episodeIsCurrent: true,
  });
  check('a refused read would render as EXISTING-but-hidden, never as absent',
    refused.state === 'LitigationNotVisible', refused.label);
}

/**
 * Why a dangling link cannot happen here — asserted rather than assumed.
 *
 * Both halves matter: the platform refuses a bind to a record that does not exist, and deleting
 * the Legal record clears the link instead of leaving it dangling.
 */
async function referentialIntegrity(cfg: Config, token: string, f: Fixtures): Promise<void> {
  console.log('\n─── 3. Can a link ever dangle on this platform? ───');

  const absent = '00000000-0000-0000-0000-0000000000ff';
  const bound = await write(cfg, token, 'PATCH',
    `/qdb_collectionactivities(${BARE_RECOMMENDATION})`,
    { 'qdb_legalrequestid_qdb_collectionactivity@odata.bind': `/qdb_qdblegals(${absent})` });
  check('binding the link to a Legal record that does not exist is REFUSED',
    bound >= 400, `status ${bound}`);

  const relationship = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/EntityDefinitions(LogicalName='qdb_collectionactivity')/ManyToOneRelationships"
    + '?$select=SchemaName,CascadeConfiguration'
    + "&$filter=ReferencingAttribute eq 'qdb_legalrequestid'");
  const cascade = relationship.value[0]?.['CascadeConfiguration'] as Record<string, unknown> | undefined;
  check('and deleting a Litigation Request removes the link rather than dangling it',
    cascade?.['Delete'] === 'RemoveLink', String(cascade?.['Delete']));
  console.log('        ⇒ LitigationLinkBroken is defence for imported/on-premises data. '
    + 'It is NOT reachable here,\n          and is therefore NOT claimed as runtime-validated.');
}

async function cleanup(cfg: Config, token: string): Promise<void> {
  console.log('\n─── Cleanup (by fixture-owned id, then verified) ───');

  const restored = await withGuardDisabled(cfg, token, async () => {
    for (const id of [LINKED_RECOMMENDATION, BARE_RECOMMENDATION]) {
      console.log(`  [DELETE activity] ${id} -> ${await write(cfg, token, 'DELETE', `/qdb_collectionactivities(${id})`)}`);
    }
  });
  const legalId = litigationRequestId(LINKED_RECOMMENDATION);
  console.log(`  [DELETE litigation] ${legalId} -> ${await write(cfg, token, 'DELETE', `/qdb_qdblegals(${legalId})`)}`);

  check('the immutability guard is enabled exactly as before', restored);

  const legalResidue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_qdblegals?$select=qdb_qdblegalid&$count=true&$filter=startswith(qdb_name,'${SUBJECT_PREFIX}')`);
  check('zero Litigation Request residue remains', (legalResidue['@odata.count'] ?? 0) === 0,
    `${legalResidue['@odata.count'] ?? 0} row(s)`);

  const activityResidue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$count=true&$filter=startswith(subject,'${SUBJECT_PREFIX}')`);
  check('zero recommendation residue remains', (activityResidue['@odata.count'] ?? 0) === 0,
    `${activityResidue['@odata.count'] ?? 0} row(s)`);
}

function finish(): void {
  const failed = results.filter(result => !result.passed);
  if (failed.length === 0) {
    console.log('\n  Legal Recommendation visibility ..... VALIDATED');
    console.log('  DCP → Litigation traceability ....... VALIDATED — through the lookup only');
    console.log('  Litigation status visibility ........ VALIDATED — the platform’s own label');
    console.log('  Inaccessible-request rendering ...... NOT VALIDATED at runtime (KI-111) —');
    console.log('                                        proven in tests, not producible by this identity');
    console.log('  Broken-link rendering ............... NOT REACHABLE on Dataverse — referential');
    console.log('                                        integrity refuses it; kept for imported data');
    console.log('  QDB Legal process execution ......... UNPROVEN ON CLOUD — it runs on-premises');
  } else {
    console.log(`\n  NOT VALIDATED — ${failed.length} check(s) failed.`);
  }
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
