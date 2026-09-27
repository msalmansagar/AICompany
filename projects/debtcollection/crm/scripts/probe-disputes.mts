/**
 * probe-disputes.mts
 * WP12 discovery — what does QDB already have for disputes and complaints?
 *
 * Read-only. It creates nothing and changes nothing.
 *
 * WP11 taught the lesson this probe is built around: **QDB may not use the word.** Restructuring
 * was modelled as *Facility Amendment* and a name sweep missed it entirely. So this searches
 * semantically — entity and display names, attribute names, option-set **labels**, the Process
 * Engine's content, and native Dynamics Case management, which is where a bank's complaint
 * handling most plausibly already lives.
 *
 * Four questions, and the fourth is the one that actually matters:
 *
 *   1. Does a dispute/complaint entity or process exist?
 *   2. Does QDB **distinguish** a collection dispute from a service complaint?
 *   3. Is native `incident` (Case) in use, and does it carry collection-shaped subjects?
 *   4. **Is there any configured behaviour that stops collection while a dispute is open?**
 *      Nothing may be assumed about that — not communications, not strategy, not DPD.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/probe-disputes.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';

const TERMS = [
  'dispute', 'complaint', 'grievance', 'objection', 'contest', 'appeal', 'escalation',
  'feedback', 'inquiry', 'enquiry', 'query', 'issue', 'incident', 'ticket', 'case',
  'discrepan', 'mismatch', 'incorrect', 'unreflected', 'reconcil', 'clarification',
];
const MATCHER = new RegExp(TERMS.join('|'), 'i');

/** Narrower set for the noisiest words, used where 'case' and 'issue' would match everything. */
const STRICT = /dispute|complaint|grievance|objection|contest|discrepan|grieve/i;

const NOISE = /^(msdyn|msdynce|msfp|adx|mspp|powerpages|flowsession|workflow|sync|import|duplicate)/i;

interface Config { apiBase: string; orgUrl: string }

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

const heading = (text: string): void => console.log(`\n─── ${text} ───`);
const displayName = (entity: Record<string, unknown>): string =>
  String((entity['DisplayName'] as { UserLocalizedLabel?: { Label?: string } })
    ?.UserLocalizedLabel?.Label ?? '');

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}  (read-only probe)`);

  await sweepEntities(cfg, token);
  await nativeCaseManagement(cfg, token);
  await sweepOptionSetLabels(cfg, token);
  await sweepProcessAndAutomation(cfg, token);
  await collectionControlDuringDispute(cfg, token);
  await dcpSideConfiguration(cfg, token);
}

async function sweepEntities(cfg: Config, token: string): Promise<void> {
  heading('1. Entities, by logical name and display name');
  const all = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/EntityDefinitions?$select=LogicalName,DisplayName,IsCustomEntity,EntitySetName');

  const matched = all.value.filter(entity => {
    const logical = String(entity['LogicalName']);
    if (NOISE.test(logical)) return false;
    return STRICT.test(logical) || STRICT.test(displayName(entity));
  });
  console.log(`  ${all.value.length} entities; ${matched.length} match on dispute/complaint terms.`);

  for (const entity of matched) {
    const set = String(entity['EntitySetName']);
    const logical = String(entity['LogicalName']);
    let rows = '?';
    try {
      const count = await get<{ '@odata.count'?: number }>(cfg, token,
        `/${set}?$select=${logical}id&$count=true&$top=1`);
      rows = String(count['@odata.count'] ?? '?');
    } catch { rows = 'unreadable'; }
    console.log(`    ${logical}  —  ${displayName(entity)}  [${rows} row(s)]`
      + `${entity['IsCustomEntity'] ? '' : '  [platform]'}`);
  }
}

/**
 * Native Dynamics Case management — the likeliest place a complaint process already lives.
 *
 * A bank running Dynamics rarely builds complaints from scratch. `incident` carries subjects,
 * types and a resolution model out of the box, so its **row count and its configured subjects**
 * are stronger evidence than any custom entity's name.
 */
async function nativeCaseManagement(cfg: Config, token: string): Promise<void> {
  heading('2. Native Case management (incident) — is it in use?');

  const incidents = await get<{ '@odata.count'?: number; value: Record<string, unknown>[] }>(
    cfg, token, '/incidents?$select=title,ticketnumber,casetypecode,statuscode&$count=true&$top=10');
  console.log(`  incident: ${incidents['@odata.count'] ?? 0} row(s).`);
  for (const row of incidents.value.slice(0, 8)) {
    console.log(`    ${row['ticketnumber']} — ${row['title']} (type ${row['casetypecode']})`);
  }

  const subjects = await get<{ '@odata.count'?: number; value: Record<string, unknown>[] }>(
    cfg, token, '/subjects?$select=title,description&$count=true&$top=200');
  const matchedSubjects = subjects.value.filter(s => MATCHER.test(String(s['title'])));
  console.log(`  subject tree: ${subjects['@odata.count'] ?? 0} node(s); `
    + `${matchedSubjects.length} match.`);
  for (const s of matchedSubjects.slice(0, 15)) console.log(`    ${s['title']}`);

  // The case type / origin option sets say what QDB configured Cases to be FOR.
  for (const attribute of ['casetypecode', 'caseorigincode', 'subjectid']) {
    try {
      const meta = await get<Record<string, unknown>>(cfg, token,
        `/EntityDefinitions(LogicalName='incident')/Attributes(LogicalName='${attribute}')`
        + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet');
      const options = (meta['OptionSet'] as { Options?: OptionRow[] })?.Options ?? [];
      console.log(`  incident.${attribute}: `
        + options.map(o => `${o.Value}=${label(o)}`).join(' | '));
    } catch { /* not a picklist on this organisation */ }
  }
}

interface OptionRow { Value: number; Label?: { UserLocalizedLabel?: { Label?: string } } }
const label = (option: OptionRow): string => option.Label?.UserLocalizedLabel?.Label ?? '?';

/**
 * Option-set **labels**, across every entity.
 *
 * The strongest lesson from WP11: the concept was inside a picklist, not in an entity name. A
 * dispute reason or a complaint category would appear exactly the same way.
 */
async function sweepOptionSetLabels(cfg: Config, token: string): Promise<void> {
  heading('3. Option-set labels — where WP11’s answer was actually hiding');

  // `Options` lives on the OptionSetMetadata cast, not on the base type.
  const globals = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/GlobalOptionSetDefinitions/Microsoft.Dynamics.CRM.OptionSetMetadata?$select=Name,Options');
  let hits = 0;
  for (const set of globals.value) {
    const options = (set['Options'] as OptionRow[] | undefined) ?? [];
    const matched = options.filter(option => STRICT.test(label(option)));
    if (matched.length === 0) continue;
    hits += 1;
    console.log(`    ${set['Name']}: ${matched.map(o => `${o.Value}=${label(o)}`).join(' | ')}`);
  }
  console.log(`  ${globals.value.length} global option sets; ${hits} contain a dispute/complaint label.`);
}

async function sweepProcessAndAutomation(cfg: Config, token: string): Promise<void> {
  heading('4. Workflows, Custom APIs and the Process Engine');

  const workflows = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/workflows?$select=name,primaryentity,category,statecode&$top=2000');
  const matched = workflows.value.filter(w => STRICT.test(String(w['name'])));
  console.log(`  ${workflows.value.length} workflows; ${matched.length} match.`);
  for (const w of matched.slice(0, 20)) {
    console.log(`    [${w['category']}] ${w['name']} (${w['primaryentity']}, state ${w['statecode']})`);
  }

  const apis = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/customapis?$select=uniquename,boundentitylogicalname&$top=500');
  const matchedApis = apis.value.filter(a => STRICT.test(String(a['uniquename'])));
  console.log(`  ${apis.value.length} Custom APIs; ${matchedApis.length} match.`);
  for (const a of matchedApis) console.log(`    ${a['uniquename']}`);

  // Process Engine content, as WP11 established is necessary.
  const tables = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/EntityDefinitions?$select=LogicalName,EntitySetName,PrimaryNameAttribute'
    + '&$filter=IsCustomEntity eq true');
  const engine = tables.value.filter(t =>
    /^qdb_.*(process|step|outcome|worktask|task|route|decision|stage)/i.test(String(t['LogicalName'])));
  let engineHits = 0;
  for (const table of engine) {
    try {
      const nameField = String(table['PrimaryNameAttribute']);
      const rows = await get<{ value: Record<string, unknown>[] }>(cfg, token,
        `/${table['EntitySetName']}?$select=${nameField}&$top=400`);
      const matchedRows = rows.value.filter(row => STRICT.test(String(row[nameField] ?? '')));
      if (matchedRows.length === 0) continue;
      engineHits += matchedRows.length;
      console.log(`    ${table['LogicalName']}: ${matchedRows.length} matching`);
      for (const row of matchedRows.slice(0, 8)) console.log(`        ${row[nameField]}`);
    } catch { /* unreadable tables are reported by the entity sweep */ }
  }
  console.log(`  Process Engine: ${engine.length} tables read, ${engineHits} matching row(s).`);
}

/**
 * The question nothing may be assumed about.
 *
 * Does any existing configuration stop, pause or suppress collection activity while a dispute is
 * open? Looks for the mechanisms that *could* express it, and reports what they actually hold —
 * `creditonhold`, contact-hold columns, strategy stop flags, and any dispute-shaped column on the
 * collection case.
 */
async function collectionControlDuringDispute(cfg: Config, token: string): Promise<void> {
  heading('5. Does anything stop collection while a dispute is open?');

  for (const entity of ['qdb_collectioncase', 'qdb_collectionactivity', 'account', 'contact']) {
    const attributes = await get<{ value: Record<string, unknown>[] }>(cfg, token,
      `/EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName,AttributeType`);
    const control = attributes.value
      .map(a => String(a['LogicalName']))
      .filter(name => /hold|suspend|freeze|pause|stop|block|suppress|exclude|dispute|donot/i.test(name)
        && !name.endsWith('name') && !name.endsWith('yominame'));
    console.log(`  ${entity}: ${control.join(', ') || '(no control-shaped column)'}`);
  }

  // The strategy's own stop conditions — what configuration says already halts a strategy.
  const actions = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_strategyactions?$select=qdb_name,qdb_stoponpayment,qdb_stoponptp&$top=50');
  console.log(`  strategy stop conditions configured: `
    + `${actions.value.map(a => `${a['qdb_name']}[pay=${a['qdb_stoponpayment']},ptp=${a['qdb_stoponptp']}]`).join(' ')}`);
  console.log('  ⇒ Stop-on-dispute is NOT among them. Nothing here establishes that a dispute '
    + 'halts collection,\n    communications, strategy or DPD — that is QDB policy, and absence '
    + 'is recorded, not filled in.');
}

async function dcpSideConfiguration(cfg: Config, token: string): Promise<void> {
  heading('6. What DCP already holds');

  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_name,qdb_code,qdb_category,qdb_isactive&$top=50');
  const matched = types.value.filter(t =>
    STRICT.test(String(t['qdb_name'])) || STRICT.test(String(t['qdb_code'] ?? '')));
  console.log(`  ${types.value.length} activity types; ${matched.length} dispute/complaint-related:`);
  for (const t of matched) {
    console.log(`    ${t['qdb_name']}  code=${t['qdb_code']}  category=${t['qdb_category']}`);
  }

  const outcomes = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_activityoutcomes?$select=qdb_name,qdb_code&$top=200');
  const matchedOutcomes = outcomes.value.filter(o =>
    STRICT.test(String(o['qdb_name'])) || STRICT.test(String(o['qdb_code'] ?? '')));
  console.log(`  ${outcomes.value.length} outcomes; ${matchedOutcomes.length} match:`);
  for (const o of matchedOutcomes) console.log(`    ${o['qdb_name']} (${o['qdb_code']})`);

  console.log('\n  Reminder: an empty Cloud result is NOT evidence of absence. Legal and '
    + 'Restructuring both\n  proved that trap — the second by not using the expected word at all.');
}

await main();
