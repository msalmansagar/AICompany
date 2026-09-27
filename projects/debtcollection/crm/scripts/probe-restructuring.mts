/**
 * probe-restructuring.mts
 * WP11 discovery — is there an authoritative Restructuring/Workout process anywhere here?
 *
 * Read-only. It creates nothing and changes nothing.
 *
 * WP1 swept entity and workflow **names** for eight terms and found four empty tables. That is not
 * enough to conclude anything, for two reasons this probe addresses:
 *
 *   **QDB may not use the word "restructuring".** Seventeen terms are swept, including the ones a
 *   bank is likelier to use operationally — rescheduling, moratorium, deferment, payment holiday,
 *   tenor extension, facility amendment, remedial management.
 *   **Names are not content.** The Process Engine holds substantial configured business process on
 *   this organisation, and a restructuring route would live in its *steps, outcomes and tasks* —
 *   none of which carries the word in an entity name. WP1 never looked inside it.
 *
 * The Legal finding is the precedent: an empty Cloud sandbox reflected an environment difference,
 * not an absent process. Nothing here concludes absence from Cloud metadata alone.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/probe-restructuring.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';

/** Every word QDB might plausibly use, not only the ones DCP uses. */
const TERMS = [
  'restructur', 'reschedul', 'workout', 'work_out', 'rehabilitat', 'settlement', 'settle',
  'repaymentplan', 'repayment_plan', 'tenor', 'instalment', 'installment', 'moratorium',
  'deferment', 'deferral', 'paymentholiday', 'amendment', 'amend', 'remedial', 'recovery',
  'concession', 'forbearance', 'waiver', 'writeoff', 'write_off', 'grace',
];

const MATCHER = new RegExp(TERMS.join('|'), 'i');

/** Words that match the sweep but mean something unrelated, so the report stays readable. */
const NOISE = /^(msdyn|msdynce|msfp|adx|mspp|powerpages|flowsession|recoverypoint)/i;

interface Config { apiBase: string; orgUrl: string }

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

const heading = (text: string): void => console.log(`\n─── ${text} ───`);

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}  (read-only probe)`);
  console.log(`  ${TERMS.length} terms swept.`);

  const entities = await sweepEntities(cfg, token);
  await sweepWorkflowsAndActions(cfg, token);
  await sweepProcessEngine(cfg, token);
  await inspectCandidates(cfg, token, entities);
  await sweepCollectionSideConfiguration(cfg, token);
}

/** Entity names AND display names — a table called `qdb_mac_app_resched` hides from one of them. */
async function sweepEntities(cfg: Config, token: string): Promise<string[]> {
  heading('1. Every entity, by logical name and display name');
  const all = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/EntityDefinitions?$select=LogicalName,DisplayName,IsCustomEntity');

  const matched = all.value.filter(entity => {
    const logical = String(entity['LogicalName']);
    if (NOISE.test(logical)) return false;
    const display = displayName(entity);
    return MATCHER.test(logical) || MATCHER.test(display);
  });

  console.log(`  ${all.value.length} entities; ${matched.length} match after removing platform noise.`);
  for (const entity of matched) {
    console.log(`    ${entity['LogicalName']}  —  ${displayName(entity)}`
      + `${entity['IsCustomEntity'] ? '' : '  [platform]'}`);
  }
  return matched.map(entity => String(entity['LogicalName']));
}

const displayName = (entity: Record<string, unknown>): string =>
  String((entity['DisplayName'] as { UserLocalizedLabel?: { Label?: string } })
    ?.UserLocalizedLabel?.Label ?? '');

async function sweepWorkflowsAndActions(cfg: Config, token: string): Promise<void> {
  heading('2. Workflows, actions and business process flows');
  const workflows = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/workflows?$select=name,primaryentity,category,statecode&$top=2000');
  const matched = workflows.value.filter(w => MATCHER.test(String(w['name'])));
  console.log(`  ${workflows.value.length} workflows; ${matched.length} match.`);
  for (const w of matched.slice(0, 25)) {
    console.log(`    [${w['category']}] ${w['name']}  (${w['primaryentity']}, state ${w['statecode']})`);
  }

  const apis = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/customapis?$select=uniquename,name,boundentitylogicalname&$top=500');
  const matchedApis = apis.value.filter(a =>
    MATCHER.test(String(a['uniquename'])) || MATCHER.test(String(a['name'])));
  console.log(`  ${apis.value.length} Custom APIs; ${matchedApis.length} match.`);
  for (const a of matchedApis) console.log(`    ${a['uniquename']}  (${a['boundentitylogicalname'] ?? 'unbound'})`);
}

/**
 * The Process Engine's **content**, which is where a real restructuring route would live.
 *
 * WP1 searched entity and workflow names and found nothing. A configured business process does not
 * announce itself in an entity name — it appears as a process, a step, an outcome or a task. This
 * organisation already runs that engine, so its rows are the strongest available Cloud evidence.
 */
async function sweepProcessEngine(cfg: Config, token: string): Promise<void> {
  heading('3. Inside the Process Engine — processes, steps, outcomes, tasks');

  const engineTables = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/EntityDefinitions?$select=LogicalName,EntitySetName,PrimaryNameAttribute'
    + '&$filter=IsCustomEntity eq true');
  const candidates = engineTables.value.filter(entity =>
    /^qdb_.*(process|step|outcome|worktask|task|route|decision|stage|activity)/i
      .test(String(entity['LogicalName'])));

  console.log(`  ${candidates.length} Process-Engine-shaped tables to read.`);

  for (const table of candidates) {
    const set = String(table['EntitySetName']);
    const nameField = String(table['PrimaryNameAttribute']);
    try {
      const rows = await get<{ '@odata.count'?: number; value: Record<string, unknown>[] }>(
        cfg, token, `/${set}?$select=${nameField}&$count=true&$top=400`);
      const total = rows['@odata.count'] ?? 0;
      const hits = rows.value.filter(row => MATCHER.test(String(row[nameField] ?? '')));
      const flag = hits.length > 0 ? '  ◄── MATCHES' : '';
      console.log(`    ${table['LogicalName']}: ${total} row(s), ${hits.length} matching${flag}`);
      for (const hit of hits.slice(0, 10)) console.log(`        ${hit[nameField]}`);
    } catch (error) {
      console.log(`    ${table['LogicalName']}: not readable — ${(error as Error).message.slice(0, 60)}`);
    }
  }
}

/** The four WP1 candidates, in full — empty data alone classifies nothing. */
async function inspectCandidates(
  cfg: Config, token: string, matchedEntities: string[],
): Promise<void> {
  heading('4. The candidate entities, in full');
  const known = ['qdb_customer_restructure_history', 'qdb_macapplicationrescheduling',
    'qdb_nrgpwriteoff', 'qdb_tawarruqaccountrescheduling'];
  const toInspect = [...new Set([...known, ...matchedEntities.filter(e => e.startsWith('qdb_'))])];

  for (const logical of toInspect) {
    try {
      const meta = await get<Record<string, unknown>>(cfg, token,
        `/EntityDefinitions(LogicalName='${logical}')`
        + '?$select=LogicalName,EntitySetName,OwnershipType,IsAuditEnabled,IsCustomEntity');
      const set = String(meta['EntitySetName']);
      const key = `${logical}id`;

      const rows = await get<{ '@odata.count'?: number }>(cfg, token,
        `/${set}?$select=${key}&$count=true&$top=1`);
      const steps = await get<{ value: Record<string, unknown>[] }>(cfg, token,
        `/sdkmessageprocessingsteps?$select=name&$filter=contains(name,'${logical}')&$top=40`);
      const custom = steps.value.filter(s =>
        !/ObjectModel|Archive|Retain|Microsoft/i.test(String(s['name'])));
      const flows = await get<{ '@odata.count'?: number }>(cfg, token,
        `/workflows?$select=name&$count=true&$top=1&$filter=primaryentity eq '${logical}'`);
      const forms = await get<{ '@odata.count'?: number }>(cfg, token,
        `/systemforms?$select=name&$count=true&$top=1&$filter=objecttypecode eq '${logical}'`);
      const relationships = await get<{ value: Record<string, unknown>[] }>(cfg, token,
        `/EntityDefinitions(LogicalName='${logical}')/ManyToOneRelationships?$select=ReferencedEntity`);
      const targets = [...new Set(relationships.value.map(r => String(r['ReferencedEntity'])))]
        .filter(t => /account|contact|qdb_/i.test(t));

      console.log(`\n    ${logical}  (${meta['OwnershipType']}, audit=${meta['IsAuditEnabled']})`);
      console.log(`      rows=${rows['@odata.count'] ?? '?'}  customPlugins=${custom.length}  `
        + `workflows=${flows['@odata.count'] ?? 0}  forms=${forms['@odata.count'] ?? 0}`);
      console.log(`      links to: ${targets.slice(0, 8).join(', ') || 'nothing in scope'}`);
    } catch (error) {
      console.log(`\n    ${logical}: could not be inspected — ${(error as Error).message.slice(0, 80)}`);
    }
  }
}

/**
 * What DCP's own configuration already says about restructuring.
 *
 * The Restructuring Recommendation activity type exists (Phase 6). Whether any strategy action
 * routes to it, and whether anything names a downstream process, is the Collection-side half of
 * the question — and KI-112 says not to identify it by display name, so the **code** is read too.
 */
async function sweepCollectionSideConfiguration(cfg: Config, token: string): Promise<void> {
  heading('5. What DCP configuration already holds');

  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_name,qdb_code,qdb_category,qdb_processcode,'
    + 'qdb_rulecode,qdb_isactive&$top=50');
  const matched = types.value.filter(t =>
    MATCHER.test(String(t['qdb_name'])) || MATCHER.test(String(t['qdb_code'] ?? '')));
  console.log(`  ${types.value.length} activity types; ${matched.length} restructuring-related:`);
  for (const t of matched) {
    console.log(`    ${t['qdb_name']}  code=${t['qdb_code']}  category=${t['qdb_category']}  `
      + `process=${t['qdb_processcode']}  rule=${t['qdb_rulecode']}`);
  }

  const actions = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_strategyactions?$select=qdb_name,qdb_processcode,qdb_rulecode,qdb_isactive&$top=100');
  const matchedActions = actions.value.filter(a => MATCHER.test(String(a['qdb_name'])));
  console.log(`  ${actions.value.length} strategy actions; ${matchedActions.length} restructuring-related.`);
  for (const a of matchedActions) console.log(`    ${a['qdb_name']}  process=${a['qdb_processcode']}`);

  const outcomes = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_activityoutcomes?$select=qdb_name,qdb_code&$top=200');
  const matchedOutcomes = outcomes.value.filter(o =>
    MATCHER.test(String(o['qdb_name'])) || MATCHER.test(String(o['qdb_code'] ?? '')));
  console.log(`  ${outcomes.value.length} outcomes; ${matchedOutcomes.length} restructuring-related.`);
  for (const o of matchedOutcomes.slice(0, 10)) console.log(`    ${o['qdb_name']} (${o['qdb_code']})`);

  console.log('\n  Reminder: this is a Cloud design/config organisation. An empty result here is '
    + 'NOT evidence\n  that QDB has no Restructuring process — Legal proved exactly that trap.');
}

await main();
