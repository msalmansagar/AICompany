/**
 * probe-deceased-insurance.mts
 * WP15 discovery — what does QDB already have for deceased handling and insurance claims?
 *
 * Read-only. It creates nothing and changes nothing.
 *
 * Built around three lessons this engagement has already paid for:
 *
 *   **Cloud absence is not QDB absence.** Legal, Restructuring and Complaint each looked empty
 *   here and were not. Every finding is reported as *present in Cloud* or *not present in Cloud*,
 *   never as "QDB does not have it".
 *   **QDB may not use the expected word.** Restructuring was modelled as *Facility Amendment*. So
 *   this sweeps entity names, **column names**, and **option-set labels**, not just tables.
 *   **Two capabilities, not one.** Deceased handling and insurance claims are searched separately
 *   and reported separately, because collapsing them would invent a lifecycle QDB may not have.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/probe-deceased-insurance.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';

/** Deceased-side vocabulary. Kept apart from insurance on purpose. */
const DECEASED = /deceased|decease|death|dead|mortality|heir|estate|nextofkin|next_of_kin|bereav|inherit|succession/i;

/** Insurance-side vocabulary. */
const INSURANCE = /insur|takaful|policy|coverage|covered|premium|claim|beneficiar|indemnit|underwrit|assur/i;

/** Words that match but mean something else entirely, so the report stays readable. */
const NOISE = /^(msdyn|msdynce|msfp|adx|mspp|powerpages|flowsession)|policyid|privilege|securitypolicy|passwordpolicy|claimsmap|autoclaim/i;

interface Config { apiBase: string; orgUrl: string }
interface OptionRow { Value: number; Label?: { UserLocalizedLabel?: { Label?: string } } }

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

const heading = (text: string): void => console.log(`\n═══ ${text} ═══`);
const label = (option: OptionRow): string => option.Label?.UserLocalizedLabel?.Label ?? '?';
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
  console.log(`  Organisation: ${cfg.orgUrl}  (read-only)`);

  const entities = await sweepEntities(cfg, token);
  await sweepColumns(cfg, token);
  await sweepOptionLabels(cfg, token);
  await sweepAutomation(cfg, token);
  await inspectCandidates(cfg, token, entities);
  await deceasedSourceOfTruth(cfg, token);
  await securityPosture(cfg, token);
  await documentHandling(cfg, token);
}

async function sweepEntities(cfg: Config, token: string): Promise<string[]> {
  heading('1. Entities — by logical name and display name');
  const all = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/EntityDefinitions?$select=LogicalName,DisplayName,EntitySetName,IsCustomEntity');

  const matched: { logical: string; set: string; display: string; side: string }[] = [];
  for (const entity of all.value) {
    const logical = String(entity['LogicalName']);
    if (NOISE.test(logical)) continue;
    const display = displayName(entity);
    const isDeceased = DECEASED.test(logical) || DECEASED.test(display);
    const isInsurance = INSURANCE.test(logical) || INSURANCE.test(display);
    if (!isDeceased && !isInsurance) continue;
    matched.push({
      logical, set: String(entity['EntitySetName']), display,
      side: isDeceased && isInsurance ? 'BOTH' : isDeceased ? 'DECEASED' : 'INSURANCE',
    });
  }

  console.log(`  ${all.value.length} entities; ${matched.length} match.`);
  for (const entity of matched) {
    let rows = '?';
    try {
      const count = await get<{ '@odata.count'?: number }>(cfg, token,
        `/${entity.set}?$select=${entity.logical}id&$count=true&$top=1`);
      rows = String(count['@odata.count'] ?? '?');
    } catch { rows = 'unreadable'; }
    console.log(`    [${entity.side.padEnd(9)}] ${entity.logical}  —  ${entity.display}  [${rows} row(s)]`);
  }
  return matched.map(entity => entity.logical);
}

/**
 * Columns, across the entities that matter.
 *
 * A deceased marker is far likelier to be a column on `contact` or a snapshot than a table of its
 * own — `qdb_isdeceasedperqcb` already is.
 */
async function sweepColumns(cfg: Config, token: string): Promise<void> {
  heading('2. Columns on the entities collections already touches');

  const entities = ['contact', 'account', 'qdb_collectioncase', 'qdb_delinquencysnapshot',
    'qdb_collectionactivity', 'qdb_facility', 'qdb_qdblegal', 'incident'];

  for (const entity of entities) {
    try {
      const attributes = await get<{ value: Record<string, unknown>[] }>(cfg, token,
        `/EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName,AttributeType`);
      const deceased = attributes.value.map(a => String(a['LogicalName']))
        .filter(name => DECEASED.test(name) && !name.endsWith('yominame'));
      const insurance = attributes.value.map(a => String(a['LogicalName']))
        .filter(name => INSURANCE.test(name) && !NOISE.test(name) && !name.endsWith('yominame'));
      if (deceased.length === 0 && insurance.length === 0) {
        console.log(`    ${entity}: none`);
        continue;
      }
      console.log(`    ${entity}:`);
      if (deceased.length > 0) console.log(`        DECEASED  ${deceased.join(', ')}`);
      if (insurance.length > 0) console.log(`        INSURANCE ${insurance.join(', ')}`);
    } catch (error) {
      console.log(`    ${entity}: not readable — ${(error as Error).message.slice(0, 60)}`);
    }
  }
}

/** Option-set labels — where the Restructuring answer was hiding. */
async function sweepOptionLabels(cfg: Config, token: string): Promise<void> {
  heading('3. Global option-set labels');
  const globals = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/GlobalOptionSetDefinitions/Microsoft.Dynamics.CRM.OptionSetMetadata?$select=Name,Options');

  let hits = 0;
  for (const set of globals.value) {
    const options = (set['Options'] as OptionRow[] | undefined) ?? [];
    const matched = options.filter(option =>
      DECEASED.test(label(option)) || INSURANCE.test(label(option)));
    if (matched.length === 0) continue;
    hits += 1;
    console.log(`    ${set['Name']}: ${matched.map(o => `${o.Value}=${label(o)}`).join(' | ')}`);
  }
  console.log(`  ${globals.value.length} global option sets; ${hits} contain a matching label.`);
}

async function sweepAutomation(cfg: Config, token: string): Promise<void> {
  heading('4. Workflows, Custom APIs, plugin steps and the Process Engine');

  const workflows = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/workflows?$select=name,primaryentity,category,statecode&$top=2000');
  const matched = workflows.value.filter(w =>
    DECEASED.test(String(w['name'])) || INSURANCE.test(String(w['name'])));
  console.log(`  ${workflows.value.length} workflows; ${matched.length} match.`);
  for (const w of matched.slice(0, 25)) {
    console.log(`    [cat ${w['category']}, state ${w['statecode']}] ${w['name']} (${w['primaryentity']})`);
  }

  const apis = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/customapis?$select=uniquename,boundentitylogicalname&$top=500');
  const matchedApis = apis.value.filter(a =>
    DECEASED.test(String(a['uniquename'])) || INSURANCE.test(String(a['uniquename'])));
  console.log(`  ${apis.value.length} Custom APIs; ${matchedApis.length} match.`);
  for (const a of matchedApis) console.log(`    ${a['uniquename']} (${a['boundentitylogicalname'] ?? 'unbound'})`);

  const steps = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=name,statecode&$top=2000');
  const matchedSteps = steps.value.filter(s => {
    const name = String(s['name']);
    if (/ObjectModel|Archive|Retain|Microsoft\.|Field Service|Dynamics\./i.test(name)) return false;
    return DECEASED.test(name) || INSURANCE.test(name);
  });
  console.log(`  ${steps.value.length} plugin steps; ${matchedSteps.length} match and are not internals.`);
  for (const s of matchedSteps.slice(0, 15)) console.log(`    ${s['name']} [state ${s['statecode']}]`);

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
      const matchedRows = rows.value.filter(row => {
        const text = String(row[nameField] ?? '');
        return DECEASED.test(text) || INSURANCE.test(text);
      });
      if (matchedRows.length === 0) continue;
      engineHits += matchedRows.length;
      console.log(`    ${table['LogicalName']}: ${matchedRows.length} matching`);
      for (const row of matchedRows.slice(0, 8)) console.log(`        ${row[nameField]}`);
    } catch { /* reported by the entity sweep */ }
  }
  console.log(`  Process Engine: ${engine.length} tables read, ${engineHits} matching row(s).`);
}

async function inspectCandidates(
  cfg: Config, token: string, matched: string[],
): Promise<void> {
  heading('5. The candidate entities, in full');
  const ours = matched.filter(logical => logical.startsWith('qdb_'));

  for (const logical of ours) {
    try {
      const meta = await get<Record<string, unknown>>(cfg, token,
        `/EntityDefinitions(LogicalName='${logical}')`
        + '?$select=EntitySetName,OwnershipType,IsAuditEnabled');
      const attributes = await get<{ value: Record<string, unknown>[] }>(cfg, token,
        `/EntityDefinitions(LogicalName='${logical}')/Attributes`
        + '?$select=LogicalName,AttributeType,RequiredLevel,IsValidForCreate');
      const required = attributes.value.filter(a =>
        (a['RequiredLevel'] as { Value?: string })?.Value === 'ApplicationRequired'
        && a['IsValidForCreate'] === true);
      const relationships = await get<{ value: Record<string, unknown>[] }>(cfg, token,
        `/EntityDefinitions(LogicalName='${logical}')/ManyToOneRelationships?$select=ReferencedEntity`);
      const targets = [...new Set(relationships.value.map(r => String(r['ReferencedEntity'])))]
        .filter(t => /account|contact|qdb_/i.test(t));
      const forms = await get<{ '@odata.count'?: number }>(cfg, token,
        `/systemforms?$select=name&$count=true&$top=1&$filter=objecttypecode eq '${logical}'`);
      const flows = await get<{ '@odata.count'?: number }>(cfg, token,
        `/workflows?$select=name&$count=true&$top=1&$filter=primaryentity eq '${logical}'`);
      const keys = await get<{ value: unknown[] }>(cfg, token,
        `/EntityDefinitions(LogicalName='${logical}')/Keys?$select=LogicalName`);

      console.log(`\n    ${logical}  (${meta['OwnershipType']})`);
      console.log(`      ${attributes.value.length} attributes · forms=${forms['@odata.count'] ?? 0} `
        + `· workflows=${flows['@odata.count'] ?? 0} · alternateKeys=${keys.value.length}`);
      console.log(`      required on create: ${required.map(a => a['LogicalName']).join(', ') || 'none'}`);
      console.log(`      links to: ${targets.slice(0, 10).join(', ') || 'nothing in scope'}`);
    } catch (error) {
      console.log(`\n    ${logical}: not inspectable — ${(error as Error).message.slice(0, 70)}`);
    }
  }
}

/** What actually carries a deceased marker, and how many rows hold one. */
async function deceasedSourceOfTruth(cfg: Config, token: string): Promise<void> {
  heading('6. Where a deceased marker actually lives, and how many rows carry it');

  const probes: { set: string; column: string; note: string }[] = [
    { set: 'qdb_delinquencysnapshots', column: 'qdb_isdeceasedperqcb', note: 'DCP snapshot — the MIS-derived marker' },
    { set: 'contacts', column: 'qdb_isdeceasedperqcb', note: 'contact — if QDB mirrors it' },
  ];

  for (const probe of probes) {
    try {
      const total = await get<{ '@odata.count'?: number }>(cfg, token,
        `/${probe.set}?$select=${probe.set.slice(0, -1)}id&$count=true&$top=1`);
      const flagged = await get<{ '@odata.count'?: number }>(cfg, token,
        `/${probe.set}?$select=${probe.set.slice(0, -1)}id&$count=true&$top=1`
        + `&$filter=${probe.column} eq true`);
      console.log(`    ${probe.set}.${probe.column}: ${flagged['@odata.count']} of `
        + `${total['@odata.count']} — ${probe.note}`);
    } catch (error) {
      console.log(`    ${probe.set}.${probe.column}: ${(error as Error).message.slice(0, 80)}`);
    }
  }

  // Does the case status taxonomy already carry Deceased?
  try {
    const meta = await get<Record<string, unknown>>(cfg, token,
      "/EntityDefinitions(LogicalName='qdb_collectioncase')/Attributes(LogicalName='statuscode')"
      + '/Microsoft.Dynamics.CRM.StatusAttributeMetadata?$select=LogicalName&$expand=OptionSet');
    const options = (meta['OptionSet'] as { Options?: OptionRow[] })?.Options ?? [];
    const deceased = options.filter(option => DECEASED.test(label(option)));
    console.log(`    qdb_collectioncase.statuscode deceased-related: `
      + `${deceased.map(o => `${o.Value}=${label(o)}`).join(' | ') || 'none'}`);
    const used = deceased.length > 0
      ? await get<{ '@odata.count'?: number }>(cfg, token,
        `/qdb_collectioncases?$select=qdb_collectioncaseid&$count=true&$top=1`
        + `&$filter=statuscode eq ${deceased[0]!.Value}`)
      : { '@odata.count': 0 };
    console.log(`      cases currently in that status: ${used['@odata.count'] ?? 0}`);
  } catch (error) {
    console.log(`    case status: ${(error as Error).message.slice(0, 70)}`);
  }

  // And the activity type DCP already ships.
  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_name,qdb_code,qdb_category,qdb_isactive&$top=50');
  const matched = types.value.filter(t =>
    DECEASED.test(String(t['qdb_name'])) || INSURANCE.test(String(t['qdb_name'])));
  for (const t of matched) {
    console.log(`    activity type: ${t['qdb_name']} code=${t['qdb_code']} category=${t['qdb_category']}`);
  }
}

async function securityPosture(cfg: Config, token: string): Promise<void> {
  heading('7. Security — who could read or write any of it');

  const roles = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/roles?$select=roleid,name&$top=500');
  const byId = new Map(roles.value.map(r => [String(r['roleid']), String(r['name'])]));

  const privileges = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/privileges?$select=name,privilegeid&$top=5000');
  const matched = privileges.value.filter(p => {
    const name = String(p['name']);
    return (DECEASED.test(name) || INSURANCE.test(name)) && !NOISE.test(name);
  });
  console.log(`  ${matched.length} privilege(s) match:`);

  for (const privilege of matched.slice(0, 12)) {
    const holders = await get<{ value: Record<string, unknown>[] }>(cfg, token,
      `/roleprivilegescollection?$select=roleid&$filter=privilegeid eq ${privilege['privilegeid']}`);
    const names = [...new Set(holders.value.map(h => byId.get(String(h['roleid'])) ?? '?'))];
    const dcp = names.filter(name => /dcp|collect/i.test(name));
    console.log(`    ${privilege['name']}: ${names.length} role(s); DCP/collection: ${dcp.join(', ') || 'NONE'}`);
  }
}

async function documentHandling(cfg: Config, token: string): Promise<void> {
  heading('8. Document handling — what exists before anything is designed');

  for (const entity of ['sharepointdocumentlocation', 'sharepointsite', 'annotation']) {
    try {
      const count = await get<{ '@odata.count'?: number }>(cfg, token,
        `/${entity === 'annotation' ? 'annotations' : `${entity}s`}`
        + `?$select=${entity}id&$count=true&$top=1`);
      console.log(`    ${entity}: ${count['@odata.count'] ?? 0} row(s)`);
    } catch (error) {
      console.log(`    ${entity}: ${(error as Error).message.slice(0, 60)}`);
    }
  }

  const docTables = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/EntityDefinitions?$select=LogicalName,EntitySetName&$filter=IsCustomEntity eq true');
  const candidates = docTables.value
    .map(e => String(e['LogicalName']))
    .filter(name => /document|attach|file|upload|certificate/i.test(name));
  console.log(`    QDB document tables: ${candidates.join(', ') || 'none'}`);

  console.log('\n  Reminder: Cloud emptiness is an environment fact. Legal, Restructuring and '
    + 'Complaint each\n  looked absent here and were not.');
}

await main();
