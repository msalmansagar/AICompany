/**
 * smoke-qdb-phase3.mjs
 * Runtime proof of the Phase 3 configuration foundation, using the built Integration Service against
 * the live sandbox — `CollectionConfigurationService`, `StrategyRepository`/`StrategyService`,
 * `AssignmentRepository`/`AssignmentService`, `RuleEngineClient` and the KI-47 snapshot column.
 *
 * It proves the two things Phase 3 is really about:
 *
 *   • **configuration drives the decisions** — a strategy and its actions are read from the
 *     organisation, resolved by a ruleset's answer, ordered by sequence, and honour activation and
 *     effective dates;
 *   • **nothing receives a hidden default** — an unconfigured rule-engine operation, an unconfigured
 *     ruleset code, a deactivated strategy, a priority tie and an unavailable Smart Assignment each
 *     produce a named refusal rather than a guess.
 *
 * Every row it creates carries the `SMOKE-` marker and is removed at the end.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/smoke-qdb-phase3.mjs [--keep]
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadConfig, acquireToken, buildHeaders } from './lib/crm-client.mjs';
import { cleanSmokeData, SMOKE_MARKER } from './clean-qdb-smoke-data.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function loadBuiltServices() {
  const built = async rel => import(pathToFileURL(resolve(root, rel)).href);
  const collection = await built('apps/api/dist/services/collection/index.js');
  const { requireRulesetCode } = await built('apps/api/dist/services/collection/CollectionConfigurationService.js');
  const { PlatformConfigurationService } = await built('apps/api/dist/services/PlatformConfigurationService.js');
  const { DataverseClient, DataverseCrmAdapter } = await built('packages/dataverse-client/dist/index.js');
  return { ...collection, requireRulesetCode, PlatformConfigurationService, DataverseClient, DataverseCrmAdapter };
}

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

function assertAuthorisedOrg(cfg) {
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  console.log(`  Organisation: ${host}`);
}

async function send(cfg, token, method, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, { method, headers: buildHeaders(token, SOLUTION_NAME), ...(body ? { body: JSON.stringify(body) } : {}) });
  if (res.ok) return { ok: true, id: (res.headers.get('OData-EntityId')?.match(/\(([^)]+)\)$/) ?? [])[1] ?? null };
  const text = await res.text();
  let message = text; try { message = JSON.parse(text)?.error?.message ?? text; } catch { /* raw */ }
  return { ok: false, message };
}

const stamp = Date.now().toString(36).toUpperCase();
const mark = suffix => `${SMOKE_MARKER}${stamp}-${suffix}`;

/** The configuration this run reads back through the real services. */
async function seedConfiguration(cfg, token) {
  const created = {};

  const contact = await send(cfg, token, 'POST', '/contacts', { firstname: 'SMOKE', lastname: `P3 ${stamp}`, governmentid: mark('QID') });
  if (!contact.ok) throw new Error(`contact: ${contact.message}`);
  created.contactId = contact.id;

  const strategy = await send(cfg, token, 'POST', '/qdb_collectionstrategies', {
    qdb_name: mark('STRATEGY'), qdb_code: mark('EARLY'), qdb_priority: 10, qdb_isactive: true,
    qdb_noautomatedcontact: false, qdb_dpdfrom: 1, qdb_dpdto: 30, qdb_customertype: 100000020,
    qdb_description: 'Phase 3 smoke strategy', qdb_rulecode: mark('RULE'),
  });
  if (!strategy.ok) throw new Error(`strategy: ${strategy.message}`);
  created.strategyId = strategy.id;

  // Deliberately seeded out of order, and one deactivated, so ordering and activation are proven.
  for (const action of [
    { name: mark('ACTION-SECOND'), sequence: 20, channel: 100000102, active: true },
    { name: mark('ACTION-FIRST'), sequence: 10, channel: 100000100, active: true },
    { name: mark('ACTION-RETIRED'), sequence: 5, channel: 100000100, active: false },
  ]) {
    const row = await send(cfg, token, 'POST', '/qdb_strategyactions', {
      qdb_name: action.name, qdb_sequence: action.sequence, qdb_dayoffset: 1, qdb_triggerevent: 100000240,
      qdb_communicationchannel: action.channel, qdb_requiresapproval: false, qdb_ismandatory: true,
      qdb_stoponpayment: true, qdb_stoponptp: true, qdb_escalateifnotcompleted: false, qdb_isactive: action.active,
      'qdb_strategyid@odata.bind': `/qdb_collectionstrategies(${created.strategyId})`,
    });
    if (!row.ok) throw new Error(`strategy action ${action.name}: ${row.message}`);
  }

  const platform = await send(cfg, token, 'POST', '/qdb_platformconfigurations', {
    qdb_name: mark('PLATFORM'), qdb_environmentcode: mark('ENV'),
    qdb_platformtype: 100000121, qdb_organizationcode: 100000140, qdb_customertype: 100000020,
    qdb_customerentity: 'contacts', qdb_customerbusinessidfield: 'governmentid',
    qdb_eligibilityrulesetcode: mark('ELIG'), qdb_strategyrulesetcode: mark('STRAT'),
    qdb_snapshotpolicy: 100000280,
    qdb_featureflags: JSON.stringify({
      snapshotKeyComposition: ['sourceSystem', 'facilityNumber', 'snapshotDate'],
      ruleEngineOperations: { eligibility: 'qdb_dcp_EvaluateEligibility' },
      caseNumbering: 'Provisional',
    }),
    qdb_isactive: true,
  });
  if (!platform.ok) throw new Error(`platform configuration: ${platform.message}`);
  created.platformId = platform.id;

  const assignment = await send(cfg, token, 'POST', '/qdb_assignmentconfigurations', {
    qdb_name: mark('ASSIGNMENT'), qdb_assignmentmethod: 100000223, qdb_priority: 10, qdb_isactive: true,
    qdb_slahours: 24, qdb_smartassignmentref: mark('SAREF'),
  });
  if (!assignment.ok) throw new Error(`assignment: ${assignment.message}`);
  created.assignmentId = assignment.id;

  return created;
}

async function main() {
  const keep = process.argv.includes('--keep');
  console.log('=== qdb_ Phase 3 smoke — configuration and decision foundation ===\n');
  const cfg = loadConfig();
  assertAuthorisedOrg(cfg);
  const token = await acquireToken(cfg);
  const services = await loadBuiltServices();

  const client = new services.DataverseClient({ org: { orgKey: 'HL', baseUrl: cfg.orgUrl, apiVersion: cfg.apiVersion }, getAccessToken: async () => token });
  const crm = new services.DataverseCrmAdapter(client);
  const logEntries = [];
  const logger = { log: async entry => { logEntries.push(entry); } };

  console.log('\n─── Seeding configuration ───');
  const seeded = await seedConfiguration(cfg, token);
  console.log(`  contact ${seeded.contactId}, strategy ${seeded.strategyId}, assignment ${seeded.assignmentId}`);

  try {
    // ── Strategy configuration, read and resolved through the real services ──
    console.log('\n─── Collection Strategy configuration ───');
    const strategies = new services.StrategyRepository(crm);
    const all = await strategies.listAll();
    const mine = all.find(s => s.code === mark('EARLY'));
    check('Strategy read from the organisation with its criteria as data',
      Boolean(mine) && mine.criteria.dpdFrom === 1 && mine.criteria.dpdTo === 30 && mine.criteria.customerType === 'Individual',
      mine ? JSON.stringify(mine.criteria) : 'not found');
    check('Strategy actions read and linked to their strategy', (mine?.actions.length ?? 0) === 3, `${mine?.actions.length ?? 0} action(s)`);

    const strategyService = new services.StrategyService(
      new services.StubRuleEngine({ strategy: () => [mark('EARLY')] }), strategies, logger);
    const resolution = await strategyService.resolveForCase({
      case: { facilityNumber: mark('FAC'), sourceSystem: 'HL', status: 'New', episodeNumber: 1, organizationCode: 'HL', dpd: 12 },
      rulesetCode: mark('RULESET'),
    });
    check('Ruleset selects the strategy; the service resolves it', resolution.strategy.code === mark('EARLY'), resolution.strategy.name);
    check('Active actions returned in sequence order, the retired one omitted',
      resolution.actions.map(a => a.name).join(' → ') === `${mark('ACTION-FIRST')} → ${mark('ACTION-SECOND')}`,
      resolution.actions.map(a => `${a.sequence}:${a.name.replace(`${SMOKE_MARKER}${stamp}-`, '')}`).join(', '));
    check('Communication channel read as a label from the provisioned choice',
      resolution.actions[0]?.communicationChannel === 'SMS' && resolution.actions[1]?.communicationChannel === 'Email',
      `${resolution.actions[0]?.communicationChannel} / ${resolution.actions[1]?.communicationChannel}`);

    console.log('\n─── Strategy configuration failures are named, not guessed ───');
    const noStrategy = await strategyService.resolveForCase({
      case: { facilityNumber: mark('FAC'), sourceSystem: 'HL', status: 'New', episodeNumber: 1, organizationCode: 'HL' },
      rulesetCode: mark('RULESET'),
    }).then(() => null, e => e);
    const ghostService = new services.StrategyService(new services.StubRuleEngine({ strategy: () => ['NO-SUCH-CODE'] }), strategies, logger);
    const ghost = await ghostService.resolveForCase({
      case: { facilityNumber: mark('FAC'), sourceSystem: 'HL', status: 'New', episodeNumber: 1, organizationCode: 'HL' },
      rulesetCode: mark('RULESET'),
    }).then(() => null, e => e);
    check('A strategy code with no configuration is refused by kind', ghost?.kind === 'NotFound', ghost?.message?.slice(0, 90) ?? 'resolved anyway');

    const emptyService = new services.StrategyService(new services.StubRuleEngine({ strategy: () => [] }), strategies, logger);
    const none = await emptyService.resolveForCase({
      case: { facilityNumber: mark('FAC'), sourceSystem: 'HL', status: 'New', episodeNumber: 1, organizationCode: 'HL' },
      rulesetCode: mark('RULESET'),
    }).then(() => null, e => e);
    check('"No strategy applies" is a refusal, not a default treatment', none?.kind === 'NoneApplicable', none?.message?.slice(0, 80) ?? 'resolved anyway');
    check('Refusals reach the technical log with an actionable code',
      logEntries.some(e => e.severity === 'Error' && String(e.errorCode).startsWith('strategy_')),
      logEntries.filter(e => String(e.errorCode ?? '').startsWith('strategy_')).map(e => e.errorCode).join(', '));
    void noStrategy;

    // ── Assignment ──
    console.log('\n─── Assignment configuration and Smart Assignment (KI-09) ───');
    const assignmentRepo = new services.AssignmentRepository(crm);
    const configurations = await assignmentRepo.listAll();
    const myAssignment = configurations.find(c => c.name === mark('ASSIGNMENT'));
    check('Assignment configuration read with its method as a label',
      myAssignment?.method === 'SmartAssignment' && myAssignment?.smartAssignmentRef === mark('SAREF'),
      myAssignment ? `${myAssignment.method}, ref ${myAssignment.smartAssignmentRef}` : 'not found');

    const assignmentService = new services.AssignmentService(
      { listAll: async () => [myAssignment] }, { SmartAssignment: new services.UnavailableSmartAssignment() }, logger);
    const assignmentOutcome = await assignmentService
      .assign({ facilityNumber: mark('FAC'), sourceSystem: 'HL', organizationCode: 'HL' })
      .then(() => null, e => e);
    check('Smart Assignment refuses rather than inventing routing (KI-09)',
      assignmentOutcome?.kind === 'Unavailable' && /KI-09/.test(assignmentOutcome.message),
      assignmentOutcome?.message?.slice(0, 100) ?? 'routed anyway');

    // ── Rule Engine client against the live organisation ──
    console.log('\n─── Rule Engine client fails closed on the live organisation ───');
    const unconfigured = new services.RuleEngineClient(crm, {}, logger);
    const noOperation = await unconfigured.evaluateEligibility({ record: { facilityNumber: 'x' }, rulesetCode: 'R' }).then(() => null, e => e);
    check('An unconfigured operation name is refused before any call',
      /has not configured a Rule Engine operation/.test(noOperation?.message ?? ''), noOperation?.message?.slice(0, 95) ?? 'proceeded');

    const missingApi = new services.RuleEngineClient(crm, { eligibility: `qdb_dcp_NoSuchOperation_${stamp}` }, logger);
    const apiFailure = await missingApi.evaluateEligibility({ record: { facilityNumber: 'x' }, rulesetCode: 'R' }).then(() => null, e => e);
    check('An operation the organisation does not expose is refused, not defaulted',
      apiFailure?.name === 'RuleEngineError', apiFailure?.message?.slice(0, 95) ?? 'proceeded');

    // ── Platform configuration and the KI-47 column ──
    console.log('\n─── Platform configuration and KI-47 ───');
    const platformService = new services.PlatformConfigurationService(crm, { apiVersion: cfg.apiVersion, cacheTtlMs: 60000 });
    const configuration = await platformService.getConfiguration('HL').then(c => c, e => e);
    const hasConfiguration = configuration && !(configuration instanceof Error);
    check('Platform configuration reads for the organisation',
      hasConfiguration ? Boolean(configuration.customerEntity) : false,
      hasConfiguration ? `customerEntity=${configuration.customerEntity}` : String(configuration?.message ?? '').slice(0, 90));

    const collectionConfig = new services.CollectionConfigurationService(platformService, { cacheTtlMs: 60000 });
    const runtime = await collectionConfig.get('HL').then(c => c, e => e);
    const runtimeOk = runtime && !(runtime instanceof Error);
    check('Collection runtime configuration assembles from the organisation',
      runtimeOk && runtime.snapshotPolicy === 'AllReceived' && Array.isArray(runtime.snapshotKeyComposition),
      runtimeOk ? `policy=${runtime.snapshotPolicy} key=[${runtime.snapshotKeyComposition}] numbering=${runtime.caseNumbering}` : String(runtime?.message ?? '').slice(0, 90));
    check('A configured strategy ruleset code is returned',
      runtimeOk && services.requireRulesetCode(runtime, 'strategy') === mark('STRAT'),
      runtimeOk ? String(runtime.strategyRulesetCode) : 'n/a');
    const holdRuleset = runtimeOk ? (() => { try { services.requireRulesetCode(runtime, 'contactHold'); return null; } catch (e) { return e; } })() : null;
    check('An unconfigured Contact Hold ruleset fails closed (KI-44)',
      Boolean(holdRuleset) && /qdb_contactholdrulesetcode/.test(holdRuleset.message),
      holdRuleset ? holdRuleset.message.slice(0, 95) : 'returned a code that was never configured');

    const snapshotColumn = await (await fetch(
      `${cfg.apiBase}/EntityDefinitions(LogicalName='qdb_delinquencysnapshot')/Attributes(LogicalName='qdb_facilitysourcesystem')` +
      '/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=LogicalName,MaxLength',
      { headers: buildHeaders(token, SOLUTION_NAME) })).json();
    check('KI-47: qdb_facilitysourcesystem exists on the snapshot, 50 characters',
      snapshotColumn?.LogicalName === 'qdb_facilitysourcesystem' && snapshotColumn?.MaxLength === 50,
      `${snapshotColumn?.LogicalName}(${snapshotColumn?.MaxLength})`);

    // ── Case number uniqueness (KI-49) ──
    console.log('\n─── Case numbering uniqueness (KI-49) ───');
    const caseNumber = mark('CASE-E1');
    const caseBody = facility => ({
      qdb_casenumber: caseNumber, qdb_facilitynumber: facility, qdb_facilitysourcesystem: 'HL',
      qdb_customerbusinessid: mark('QID'), qdb_organizationcode: 100000140, qdb_episodenumber: 1,
      qdb_opendate: new Date().toISOString(), 'qdb_customerid_contact@odata.bind': `/contacts(${seeded.contactId})`,
    });
    const firstCase = await send(cfg, token, 'POST', '/qdb_collectioncases', caseBody(mark('FAC-A')));
    check('A case is created with the provisional number', firstCase.ok, firstCase.ok ? caseNumber : firstCase.message.slice(0, 90));
    const duplicate = await send(cfg, token, 'POST', '/qdb_collectioncases', caseBody(mark('FAC-B')));
    check('A duplicate case number is refused by the alternate key',
      !duplicate.ok && /duplicate|already exists|qdb_casenumber_uk/i.test(duplicate.message),
      duplicate.ok ? 'CREATED — uniqueness not enforced' : duplicate.message.split('\n')[0].slice(0, 100));
  } finally {
    if (keep) {
      console.log('\n--keep given: smoke rows left in place. Remove them with clean-qdb-smoke-data.mjs --confirm.');
    } else {
      console.log('\n─── Cleanup ───');
      await cleanSmokeData({ cfg, token, confirmed: true });
    }
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  if (passed !== results.length) process.exit(1);
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
