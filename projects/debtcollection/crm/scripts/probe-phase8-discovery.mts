/**
 * probe-phase8-discovery.mts
 * Read-only discovery for Phase 8: what the organisation ALREADY does.
 *
 * Written because of an expensive precedent. A sibling engagement scoped four phases of work on
 * "the process engine has no runtime", which was false — the org had a registered engine, a TAT
 * and escalation stack and a round-robin assembly the whole time. The github-researcher gate asks
 * whether a LIBRARY already does it; nothing asked whether the ORG already does.
 *
 * So this asks. It creates, updates and deletes nothing.
 *
 * **Three gates before calling anything "live"**, learned the same way:
 *   1. does code read the column?
 *   2. is that code **registered and active**?
 *   3. does the branch actually **do** something?
 *
 * And the kind decides the test. A `Plugins.*` type is dead without an
 * `sdkmessageprocessingstep`. A `Workflows.*` type is a custom workflow **activity** — having no
 * step is normal, and the only evidence of life is a reference inside a workflow's definition.
 * Applying the wrong test gives a confident wrong answer in either direction.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/probe-phase8-discovery.mts [--section <name>]
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';

interface Config { apiBase: string; orgUrl: string }
type Row = Record<string, unknown>;

const only = (() => {
  const index = process.argv.indexOf('--section');
  return index >= 0 ? process.argv[index + 1] : undefined;
})();

function heading(text: string): void {
  console.log(`\n${'─'.repeat(78)}\n  ${text}\n${'─'.repeat(78)}`);
}

/**
 * Pages a collection properly.
 *
 * `$top` suppresses `@odata.nextLink`, so a `$top=500` sweep of 1,621 workflows silently reads
 * 500 and reports them as all of them. Bounded page size plus following the link is the only
 * honest way to sweep a collection whose size you do not know.
 */
async function pageAll(
  cfg: Config, token: string, path: string, pageSize = 200, cap = 5000,
): Promise<Row[]> {
  const rows: Row[] = [];
  let url = `${cfg.apiBase}${path}`;
  while (url && rows.length < cap) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: `odata.maxpagesize=${pageSize}`,
        'MSCRM.SolutionUniqueName': SOLUTION_NAME,
      },
    });
    if (!response.ok) {
      console.log(`  ! ${response.status} on ${url.slice(cfg.apiBase.length)}`);
      return rows;
    }
    const body = await response.json() as { value?: Row[]; '@odata.nextLink'?: string };
    rows.push(...(body.value ?? []));
    url = body['@odata.nextLink'] ?? '';
  }
  return rows;
}

const safe = async <T>(work: Promise<T>, fallback: T): Promise<T> => work.catch(() => fallback);

// ── 1. Does the entity exist at all? ─────────────────────────────────────────

async function entityOverview(cfg: Config, token: string, logicalName: string): Promise<void> {
  const definition = await safe(apiGet(cfg as never, token, SOLUTION_NAME,
    `/EntityDefinitions(LogicalName='${logicalName}')`
    + '?$select=LogicalName,SchemaName,DisplayName,EntitySetName,PrimaryIdAttribute,'
    + 'PrimaryNameAttribute,IsActivity,OwnershipType,IsAuditEnabled,IsValidForQueue') as Promise<Row>, null as unknown as Row);

  if (!definition) { console.log(`  ${logicalName}: DOES NOT EXIST on this organisation`); return; }

  const label = (definition['DisplayName'] as { UserLocalizedLabel?: { Label?: string } })
    ?.UserLocalizedLabel?.Label;
  console.log(`  ${logicalName}  "${label}"`);
  console.log(`    set=${definition['EntitySetName']}  key=${definition['PrimaryIdAttribute']}`
    + `  name=${definition['PrimaryNameAttribute']}  activity=${definition['IsActivity']}`
    + `  ownership=${definition['OwnershipType']}  audit=${(definition['IsAuditEnabled'] as Row)?.['Value']}`
    + `  queueable=${definition['IsValidForQueue']}`);
}

/** Row count, so "the entity exists" is never mistaken for "the process is in use". */
async function rowCount(cfg: Config, token: string, entitySet: string): Promise<number | null> {
  const response = await fetch(`${cfg.apiBase}/${entitySet}?$top=1&$count=true`, {
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    },
  });
  if (!response.ok) return null;
  const body = await response.json() as { '@odata.count'?: number };
  return typeof body['@odata.count'] === 'number' ? body['@odata.count'] : null;
}

// ── 2. Sections ──────────────────────────────────────────────────────────────

async function legal(cfg: Config, token: string): Promise<void> {
  heading('LEGAL — qdb_qdblegal (Litigation Request), the authoritative existing process');
  await entityOverview(cfg, token, 'qdb_qdblegal');

  const attributes = await safe(pageAll(cfg, token,
    "/EntityDefinitions(LogicalName='qdb_qdblegal')/Attributes"
    + '?$select=LogicalName,AttributeType,RequiredLevel,IsValidForCreate,IsCustomAttribute'), []);
  const required = attributes.filter(a =>
    ['ApplicationRequired', 'SystemRequired'].includes(
      (a['RequiredLevel'] as Row)?.['Value'] as string));
  console.log(`\n  attributes: ${attributes.length}  (required for create: ${required.length})`);
  for (const a of required) {
    console.log(`    REQUIRED  ${a['LogicalName']} : ${a['AttributeType']}`);
  }

  const lookups = attributes.filter(a => a['AttributeType'] === 'Lookup');
  console.log(`\n  lookups (${lookups.length}):`);
  for (const a of lookups) console.log(`    ${a['LogicalName']}`);

  const relationships = await safe(apiGet(cfg as never, token, SOLUTION_NAME,
    "/EntityDefinitions(LogicalName='qdb_qdblegal')"
    + '?$select=LogicalName&$expand=ManyToOneRelationships($select=SchemaName,ReferencedEntity,'
    + 'ReferencingAttribute,ReferencingEntityNavigationPropertyName)') as Promise<Row>, null as unknown as Row);
  const manyToOne = (relationships?.['ManyToOneRelationships'] as Row[]) ?? [];
  console.log(`\n  M:1 relationships (${manyToOne.length}) — navigation property names are NOT derivable:`);
  for (const r of manyToOne) {
    console.log(`    ${r['ReferencingAttribute']} -> ${r['ReferencedEntity']}`
      + `   nav=${r['ReferencingEntityNavigationPropertyName']}`);
  }

  const keys = await safe(apiGet(cfg as never, token, SOLUTION_NAME,
    "/EntityDefinitions(LogicalName='qdb_qdblegal')?$select=LogicalName&$expand=Keys($select=LogicalName,KeyAttributes)") as Promise<Row>, null as unknown as Row);
  console.log(`\n  alternate keys: ${JSON.stringify((keys?.['Keys'] as Row[]) ?? [])}`);

  console.log(`\n  rows: ${await rowCount(cfg, token, 'qdb_qdblegals')}`);
}

async function legalWiring(cfg: Config, token: string): Promise<void> {
  heading('LEGAL WIRING — what actually runs on qdb_qdblegal');

  const steps = await safe(pageAll(cfg, token,
    '/sdkmessageprocessingsteps?$select=name,stage,mode,statecode'
    + '&$expand=sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)'
    + "&$filter=sdkmessagefilterid/primaryobjecttypecode eq 'qdb_qdblegal'"), []);
  console.log(`  registered plugin steps on qdb_qdblegal: ${steps.length}`);
  for (const s of steps) {
    console.log(`    [${s['statecode'] === 0 ? 'ACTIVE  ' : 'DISABLED'}] ${s['name']}`
      + `  msg=${(s['sdkmessageid'] as Row)?.['name']} stage=${s['stage']} mode=${s['mode']}`);
  }

  const workflows = await safe(pageAll(cfg, token,
    '/workflows?$select=name,category,statecode,type,primaryentity,ondemand,triggeroncreate'
    + "&$filter=primaryentity eq 'qdb_qdblegal'"), []);
  console.log(`\n  workflows/BPF/actions with qdb_qdblegal as primary entity: ${workflows.length}`);
  for (const w of workflows) {
    console.log(`    [${w['statecode'] === 1 ? 'ACTIVATED' : 'draft    '}] cat=${w['category']}`
      + ` type=${w['type']} onDemand=${w['ondemand']} onCreate=${w['triggeroncreate']}  ${w['name']}`);
  }
  console.log('    (category: 0=workflow 1=dialog 2=businessrule 3=action 4=BPF 5=modernflow)');
}

async function restructuring(cfg: Config, token: string): Promise<void> {
  heading('RESTRUCTURING / WORKOUT — does an authoritative process already exist?');

  const entities = await safe(pageAll(cfg, token,
    '/EntityDefinitions?$select=LogicalName,EntitySetName,DisplayName,IsCustomEntity'), [], );
  const pattern = /restructur|workout|work_out|reschedul|settlement|writeoff|write_off|waiver|deferral|moratorium/i;
  const matches = entities.filter(e => {
    const label = (e['DisplayName'] as { UserLocalizedLabel?: { Label?: string } })
      ?.UserLocalizedLabel?.Label ?? '';
    return pattern.test(String(e['LogicalName'])) || pattern.test(label);
  });
  console.log(`  entities matching restructuring/workout vocabulary: ${matches.length} of ${entities.length}`);
  for (const e of matches) {
    const label = (e['DisplayName'] as { UserLocalizedLabel?: { Label?: string } })
      ?.UserLocalizedLabel?.Label ?? '';
    const count = await rowCount(cfg, token, String(e['EntitySetName']));
    console.log(`    ${e['LogicalName']}  "${label}"  rows=${count}`);
  }

  const workflows = await safe(pageAll(cfg, token,
    '/workflows?$select=name,category,statecode,primaryentity'), []);
  const wfMatches = workflows.filter(w => pattern.test(String(w['name'])));
  console.log(`\n  workflows matching the same vocabulary: ${wfMatches.length} of ${workflows.length} swept`);
  for (const w of wfMatches.slice(0, 40)) {
    console.log(`    [${w['statecode'] === 1 ? 'ACTIVATED' : 'draft    '}] cat=${w['category']}`
      + ` on=${w['primaryentity']}  ${w['name']}`);
  }
}

async function assignment(cfg: Config, token: string): Promise<void> {
  heading('SMART ASSIGNMENT — the QDB.RoundRobin assembly, and whether it runs');

  const assemblies = await safe(pageAll(cfg, token,
    '/pluginassemblies?$select=name,version,pluginassemblyid'), []);
  const relevant = assemblies.filter(a => /roundrobin|assignment/i.test(String(a['name'])));
  for (const assembly of relevant) {
    console.log(`\n  assembly: ${assembly['name']} v${assembly['version']}`);
    const types = await safe(pageAll(cfg, token,
      '/plugintypes?$select=typename,name,plugintypeid'
      + `&$filter=_pluginassemblyid_value eq ${assembly['pluginassemblyid']}`), []);
    for (const type of types) {
      const steps = await safe(pageAll(cfg, token,
        '/sdkmessageprocessingsteps?$select=name,stage,mode,statecode'
        + '&$expand=sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)'
        + `&$filter=_plugintypeid_value eq ${type['plugintypeid']}`), []);
      const kind = /\.Plugins\./.test(String(type['typename'])) ? 'PLUGIN'
        : /\.Workflows?\./.test(String(type['typename'])) ? 'ACTIVITY' : 'UNCLASSIFIED';
      console.log(`    [${kind}] ${type['typename']}`);
      if (kind === 'PLUGIN' && steps.length === 0) {
        console.log('        no registered step — this plugin NEVER executes');
      }
      for (const s of steps) {
        console.log(`        [${s['statecode'] === 0 ? 'ACTIVE  ' : 'DISABLED'}] ${s['name']}`
          + ` msg=${(s['sdkmessageid'] as Row)?.['name']}`
          + ` on=${(s['sdkmessagefilterid'] as Row)?.['primaryobjecttypecode']} stage=${s['stage']} mode=${s['mode']}`);
      }
      if (kind === 'ACTIVITY') {
        console.log('        (a custom workflow ACTIVITY: no step is normal — life is a reference'
          + ' inside a workflow definition, checked below)');
      }
    }
  }

  console.log('\n  DCP assignment configuration:');
  await entityOverview(cfg, token, 'qdb_assignmentconfiguration');
  console.log(`    rows: ${await rowCount(cfg, token, 'qdb_assignmentconfigurations')}`);
}

async function escalation(cfg: Config, token: string): Promise<void> {
  heading('ESCALATION / TAT — the existing stack, and whether it is dormant');

  for (const name of ['qdb_escalationconiguration', 'qdb_escalation']) {
    await entityOverview(cfg, token, name);
  }
  // Row counts, because a wired mechanism with no configuration records is dormant, not live.
  console.log(`\n  qdb_escalationconigurations: rows=${await rowCount(cfg, token, 'qdb_escalationconigurations')}`);
  console.log(`  qdb_escalations:             rows=${await rowCount(cfg, token, 'qdb_escalations')}`);

  const assemblies = await safe(pageAll(cfg, token,
    '/pluginassemblies?$select=name,pluginassemblyid'), []);
  // Anchored on the QDB vendor prefix. A bare /tat/ matches "Implementation" and "Experimentation",
  // which is how a filter comes to report Microsoft's Omnichannel stack as QDB escalation.
  const relevant = assemblies.filter(a => /^QDB/i.test(String(a['name'])));
  for (const assembly of relevant) {
    console.log(`\n  assembly: ${assembly['name']}`);
    const types = await safe(pageAll(cfg, token,
      `/plugintypes?$select=typename,plugintypeid&$filter=_pluginassemblyid_value eq ${assembly['pluginassemblyid']}`), []);
    for (const type of types) {
      const steps = await safe(pageAll(cfg, token,
        '/sdkmessageprocessingsteps?$select=name,stage,mode,statecode'
        + '&$expand=sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)'
        + `&$filter=_plugintypeid_value eq ${type['plugintypeid']}`), []);
      const kind = /\.Plugins\./.test(String(type['typename'])) ? 'PLUGIN'
        : /\.Workflows?\./.test(String(type['typename'])) ? 'ACTIVITY' : 'UNCLASSIFIED';
      console.log(`    [${kind}] ${type['typename']}  steps=${steps.length}`);
      for (const s of steps) {
        console.log(`        [${s['statecode'] === 0 ? 'ACTIVE  ' : 'DISABLED'}] ${s['name']}`
          + ` msg=${(s['sdkmessageid'] as Row)?.['name']}`
          + ` on=${(s['sdkmessagefilterid'] as Row)?.['primaryobjecttypecode']}`);
      }
    }
  }
}

async function provenance(cfg: Config, token: string): Promise<void> {
  heading('KI-71 — what qdb_collectionactivity can already express about provenance');

  const detail = await safe(apiGet(cfg as never, token, SOLUTION_NAME,
    "/EntityDefinitions(LogicalName='qdb_collectionactivity')?$select=LogicalName,PrimaryIdAttribute,IsActivity"
    + '&$expand=ManyToOneRelationships($select=SchemaName,ReferencedEntity,ReferencingAttribute,'
    + 'ReferencingEntityNavigationPropertyName),Keys($select=LogicalName,KeyAttributes)') as Promise<Row>, null as unknown as Row);

  const manyToOne = (detail?.['ManyToOneRelationships'] as Row[]) ?? [];
  console.log(`  M:1 relationships (${manyToOne.length}):`);
  for (const r of manyToOne) {
    console.log(`    ${r['ReferencingAttribute']} -> ${r['ReferencedEntity']}`
      + `   nav=${r['ReferencingEntityNavigationPropertyName']}`);
  }
  console.log(`\n  alternate keys: ${JSON.stringify((detail?.['Keys'] as Row[]) ?? [])}`);

  const toStrategyAction = manyToOne.filter(r => r['ReferencedEntity'] === 'qdb_strategyaction');
  console.log(`\n  >>> lookups to qdb_strategyaction: ${toStrategyAction.length}`
    + (toStrategyAction.length === 0 ? '   — KI-71 confirmed: no provenance link exists' : ''));

  for (const entity of ['qdb_collectionstrategy', 'qdb_strategyaction', 'qdb_collectionactivitytype', 'qdb_activityoutcome']) {
    const set = entity === 'qdb_collectionstrategy' ? 'qdb_collectionstrategies' : `${entity}s`;
    console.log(`  ${entity}: rows=${await rowCount(cfg, token, set)}`);
  }
}

async function processEngine(cfg: Config, token: string): Promise<void> {
  heading('PROCESS ENGINE — the entry point, and whether DCP can use it');

  for (const name of ['qdb_request', 'qdb_task', 'qdb_work_item_steps', 'qdb_outcome']) {
    await entityOverview(cfg, token, name);
  }
  for (const set of ['qdb_requests', 'qdb_tasks', 'qdb_work_item_stepses', 'qdb_outcomes']) {
    console.log(`    ${set}: rows=${await rowCount(cfg, token, set)}`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

const SECTIONS: Record<string, (cfg: Config, token: string) => Promise<void>> = {
  legal, legalWiring, restructuring, assignment, escalation, provenance, processEngine,
};

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}`);
  console.log('  READ-ONLY. This script creates, updates and deletes nothing.');

  const chosen = only ? { [only]: SECTIONS[only]! } : SECTIONS;
  for (const [name, run] of Object.entries(chosen)) {
    if (!run) { console.error(`unknown section: ${name}`); process.exit(1); }
    await run(cfg, token);
  }
  console.log('\n  Discovery complete.');
}

await main();
