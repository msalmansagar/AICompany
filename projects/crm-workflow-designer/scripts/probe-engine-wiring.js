'use strict';

/**
 * probe-engine-wiring.js
 *
 * READ-ONLY diagnostic. Answers one question: for each piece of the QDB process
 * engine, is it actually wired to run?
 *
 * Three gates, learned the hard way on this engagement:
 *   1. Does a column exist?
 *   2. Does anything READ it — assembly code, or a workflow definition?
 *   3. If it is code, is it REACHABLE — a registered plugin step, or a workflow
 *      activity that some workflow definition actually invokes?
 *
 * A `Plugins.*` type with no sdkmessageprocessingstep never executes. A
 * `Workflows.*` type is a custom workflow activity: having no step is normal,
 * and the only evidence of life is a reference inside a workflow's XAML. Both
 * routes must be checked before calling anything dead.
 *
 * Backs the claims in cwfd-005-runtime/platform-team-questions.md. Re-run this
 * before acting on any answer from the platform team.
 *
 * Usage (from projects/crm-workflow-designer):
 *   DATAVERSE_URL=<org url> node --env-file=.env.local scripts/probe-engine-wiring.js
 */

const { loadCrmConfig, getToken, buildHeaders } = require('./crm-api-client.js');

const ENGINE_ASSEMBLIES = [
  'QDB.CRM.ProcessConfiguration',
  'QDBCatalog.CRM.TatAndEscalations',
  'QDB.RoundRobin',
];

/** Deadline columns with no known reader — Q1 of the platform-team questions. */
const TAT_COLUMNS = [
  'qdb_agreedtat', 'qdb_tasktat', 'qdb_tat_days', 'qdb_tat_level2_days',
  'qdb_tat_level3_days', 'qdb_tatlevel4days', 'qdb_exclude_tat',
  'qdb_reminder', 'qdb_escalationtimeformat', 'qdb_escalationlevel4',
];

/** Columns this engagement added and then retired — Q2, deletion candidates. */
const RETIRED_COLUMNS = [
  'qdb_sla_enabled', 'qdb_sla_duration', 'qdb_sla_duration_unit', 'qdb_sla_basis',
  'qdb_sla_warning_pct', 'qdb_escalation_enabled', 'qdb_escalation_action',
  'qdb_escalation_target_type', 'qdb_escalationuser', 'qdb_escalationteam',
  'qdb_escalationrole', 'qdb_splittype', 'qdb_jointype',
];

/** The escalation columns the engine genuinely reads — expected present. */
const LIVE_ESCALATION_COLUMNS = ['qdb_escalation', 'qdb_applyescalationfilter'];

/** Custom workflow activities whose only evidence of life is a workflow reference. */
const WORKFLOW_ACTIVITIES = [
  'ApplyProcess', 'ApplyDelegation', 'ApplyRoundRobin', 'AssignApplication',
  'RemoveItemFromQueue', 'CreateEscalationRecord', 'CreateTask', 'CloneProcess',
  'TaskOnHoldOperations', 'CancelAssociateTask',
];

/** Output tables — all zero means the engine has never executed here. */
const EXECUTION_EVIDENCE_TABLES = [
  ['qdb_tasks', 'tasks ever created'],
  ['qdb_escalations', 'escalations raised'],
  ['qdb_status_histories', 'status history rows'],
  ['qdb_escalationconigurations', 'escalation policies (platform misspelling)'],
  ['qdb_user_delegates', 'delegation records'],
];

const PLUGIN_MODE_LABELS = { 0: 'sync', 1: 'async' };

/**
 * Issues a GET against the Web API and returns the parsed body.
 * @param {string} url absolute request url
 * @param {Record<string, string>} headers request headers
 * @returns {Promise<any>} parsed response body
 */
async function getJson(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GET ${url.slice(0, 140)} -> ${response.status} ${body.slice(0, 240)}`);
  }
  return response.json();
}

/**
 * Follows @odata.nextLink until every page has been read.
 * @param {string} startUrl first page url
 * @param {Record<string, string>} headers request headers
 * @returns {Promise<any[]>} every record across all pages
 */
async function getAllPages(startUrl, headers) {
  const pagedHeaders = { ...headers, Prefer: 'odata.maxpagesize=200' };
  const records = [];
  let url = startUrl;
  while (url) {
    const page = await getJson(url, pagedHeaders);
    records.push(...page.value);
    url = page['@odata.nextLink'] || null;
  }
  return records;
}

/**
 * Reads an entity's attribute logical names and types.
 * @param {string} apiBase Web API base url
 * @param {Record<string, string>} headers request headers
 * @param {string} entityLogicalName entity to describe
 * @returns {Promise<Map<string, string>>} logical name to attribute type
 */
async function readAttributeMap(apiBase, headers, entityLogicalName) {
  const url = `${apiBase}/EntityDefinitions(LogicalName='${entityLogicalName}')`
    + `/Attributes?$select=LogicalName,AttributeType`;
  const data = await getJson(url, headers);
  return new Map(data.value.map((attribute) => [attribute.LogicalName, attribute.AttributeType]));
}

/**
 * Prints which of the wanted columns exist on an entity.
 * @param {{ label: string, attributes: Map<string, string>, wanted: string[] }} report
 * @returns {void}
 */
function printColumnPresence({ label, attributes, wanted }) {
  const present = wanted.filter((name) => attributes.has(name));
  const absent = wanted.filter((name) => !attributes.has(name));
  console.log(`\n--- ${label} — ${present.length}/${wanted.length} present ---`);
  present.forEach((name) => console.log(`  + ${name} (${attributes.get(name)})`));
  absent.forEach((name) => console.log(`  - ${name} (absent)`));
}

/**
 * Concatenates the two fields a workflow definition can store its body in.
 * @param {{ xaml?: string, clientdata?: string }} workflow workflow record
 * @returns {string} searchable definition text
 */
function definitionTextOf(workflow) {
  return `${workflow.xaml || ''}\n${workflow.clientdata || ''}`;
}

/**
 * Prints, for each needle, which workflow definitions mention it.
 * @param {{ label: string, workflows: any[], needles: string[] }} report
 * @returns {void}
 */
function printWorkflowReferences({ label, workflows, needles }) {
  console.log(`\n--- ${label} ---`);
  for (const needle of needles) {
    const hits = workflows.filter((workflow) => definitionTextOf(workflow).includes(needle));
    if (hits.length === 0) {
      console.log(`  ${needle.padEnd(26)} -> NOT REFERENCED BY ANY WORKFLOW`);
      continue;
    }
    console.log(`  ${needle.padEnd(26)} -> ${hits.length} workflow(s)`);
    hits.slice(0, 8).forEach((hit) => console.log(
      `        [state ${hit.statecode}] cat=${hit.category} "${hit.name}" on ${hit.primaryentity}`));
  }
}

/**
 * Prints every plugin type in the engine assemblies with its registered steps.
 * @param {string} apiBase Web API base url
 * @param {Record<string, string>} headers request headers
 * @returns {Promise<void>}
 */
async function printPluginRegistrations(apiBase, headers) {
  console.log('\n=== PLUGIN TYPES vs REGISTERED SDK STEPS ===');
  for (const assemblyName of ENGINE_ASSEMBLIES) {
    const assemblies = await getJson(`${apiBase}/pluginassemblies`
      + `?$select=pluginassemblyid,name&$filter=name eq '${assemblyName}'`, headers);
    if (assemblies.value.length === 0) {
      console.log(`\n  ASSEMBLY ${assemblyName} -> NOT FOUND ON THIS ORG`);
      continue;
    }
    await printTypesForAssembly(apiBase, headers, assemblies.value[0]);
  }
}

/**
 * Prints the registration state of every plugin type in one assembly.
 * @param {string} apiBase Web API base url
 * @param {Record<string, string>} headers request headers
 * @param {{ pluginassemblyid: string, name: string }} assembly assembly record
 * @returns {Promise<void>}
 */
async function printTypesForAssembly(apiBase, headers, assembly) {
  const types = await getJson(`${apiBase}/plugintypes?$select=plugintypeid,typename`
    + `&$filter=_pluginassemblyid_value eq ${assembly.pluginassemblyid}`, headers);
  console.log(`\n  ASSEMBLY ${assembly.name} — ${types.value.length} plugin types`);
  for (const type of types.value) {
    const steps = await getJson(`${apiBase}/sdkmessageprocessingsteps`
      + `?$select=name,stage,mode,statecode&$filter=_plugintypeid_value eq ${type.plugintypeid}`,
      headers);
    console.log(`    ${type.typename}`);
    console.log(`        -> ${describeSteps(type.typename, steps.value)}`);
  }
}

/**
 * Describes a plugin type's registrations, flagging genuinely unreachable code.
 *
 * A missing step means different things for the two kinds of type, so this
 * classifies by namespace segment — and deliberately refuses to guess when the
 * name carries neither segment (`QDB.RoundRobin.AssignApplication` is the live
 * example). Calling an unclassifiable type "dead" is exactly the error this
 * script exists to prevent.
 *
 * @param {string} typeName full plugin type name
 * @param {any[]} steps registered sdk message processing steps
 * @returns {string} human-readable registration state
 */
function describeSteps(typeName, steps) {
  if (steps.length > 0) {
    return steps.map((step) => `${step.name} [stage ${step.stage}, `
      + `${PLUGIN_MODE_LABELS[step.mode] ?? step.mode}, state ${step.statecode}]`).join('; ');
  }
  if (/\.Workflows?\./.test(typeName)) {
    return 'no step — EXPECTED for a workflow activity; see the workflow-reference section';
  }
  if (/\.Plugins\./.test(typeName)) {
    return '*** NO REGISTERED STEP — THIS PLUGIN NEVER RUNS ***';
  }
  return 'no step — KIND UNKNOWN from the type name; check the workflow-reference '
    + 'section before concluding anything';
}

/**
 * Prints every lookup target and picklist name on the step entity.
 *
 * Backs Q7: the claim that no sub-process mechanism exists is a claim about the
 * ABSENCE of a column, which can only be made by enumerating them all. Searching
 * for names we guessed would prove nothing.
 *
 * @param {string} apiBase Web API base url
 * @param {Record<string, string>} headers request headers
 * @returns {Promise<void>}
 */
async function printStepEntityShape(apiBase, headers) {
  const entityPath = `${apiBase}/EntityDefinitions(LogicalName='qdb_work_item_steps')/Attributes`;
  console.log('\n=== qdb_work_item_steps SHAPE (Q7 — is there a sub-process mechanism?) ===');

  const lookups = await getJson(`${entityPath}/Microsoft.Dynamics.CRM.LookupAttributeMetadata`
    + `?$select=LogicalName,Targets`, headers);
  console.log(`\n--- all ${lookups.value.length} lookups and their targets ---`);
  lookups.value.forEach((lookup) => console.log(
    `  ${lookup.LogicalName.padEnd(40)} -> ${(lookup.Targets || []).join(',')}`));

  const picklists = await getJson(`${entityPath}/Microsoft.Dynamics.CRM.PicklistAttributeMetadata`
    + `?$select=LogicalName`, headers);
  console.log(`\n--- all ${picklists.value.length} picklists ---`);
  picklists.value.forEach((picklist) => console.log(`  ${picklist.LogicalName}`));
}

/**
 * Prints row counts for the engine's output tables.
 * @param {string} apiBase Web API base url
 * @param {Record<string, string>} headers request headers
 * @returns {Promise<void>}
 */
async function printExecutionEvidence(apiBase, headers) {
  console.log('\n=== EXECUTION EVIDENCE (all zero = the engine has never run here) ===');
  for (const [entitySet, description] of EXECUTION_EVIDENCE_TABLES) {
    try {
      const data = await getJson(`${apiBase}/${entitySet}?$count=true&$top=1&$select=createdon`, headers);
      console.log(`  ${entitySet.padEnd(30)} ${String(data['@odata.count']).padStart(6)}  (${description})`);
    } catch (error) {
      console.log(`  ${entitySet.padEnd(30)}  ERROR  ${error.message.slice(0, 100)}`);
    }
  }
}

async function main() {
  const config = loadCrmConfig();
  const headers = buildHeaders(await getToken(config));
  const { apiBase } = config;

  console.log(`ORG:    ${config.orgUrl}`);
  console.log('MODE:   read-only — this script writes nothing');

  console.log('\n=== COLUMN PRESENCE ===');
  const stepAttributes = await readAttributeMap(apiBase, headers, 'qdb_work_item_steps');
  console.log(`qdb_work_item_steps carries ${stepAttributes.size} attributes`);
  printColumnPresence({ label: 'TAT columns (Q1)', attributes: stepAttributes, wanted: TAT_COLUMNS });
  printColumnPresence({ label: 'Retired columns (Q2)', attributes: stepAttributes, wanted: RETIRED_COLUMNS });
  printColumnPresence({ label: 'Live escalation columns', attributes: stepAttributes, wanted: LIVE_ESCALATION_COLUMNS });

  const sopAttributes = await readAttributeMap(apiBase, headers, 'qdb_sopstep');
  console.log(`\nqdb_sopstep carries ${sopAttributes.size} attributes`);
  printColumnPresence({ label: 'Retired columns on qdb_sopstep (Q2)', attributes: sopAttributes, wanted: RETIRED_COLUMNS });

  console.log('\n=== WORKFLOW DEFINITION REFERENCES ===');
  const workflows = await getAllPages(`${apiBase}/workflows`
    + `?$select=name,statecode,category,type,xaml,clientdata,primaryentity`, headers);
  const activatedCount = workflows.filter((workflow) => workflow.statecode === 1).length;
  console.log(`Searched ${workflows.length} workflow definitions (${activatedCount} activated)`);
  printWorkflowReferences({ label: 'Custom workflow activities — is anything invoking them?', workflows, needles: WORKFLOW_ACTIVITIES });
  printWorkflowReferences({ label: 'TAT columns (Q1)', workflows, needles: TAT_COLUMNS });
  printWorkflowReferences({ label: 'Retired columns (Q2)', workflows, needles: RETIRED_COLUMNS });

  await printStepEntityShape(apiBase, headers);
  await printPluginRegistrations(apiBase, headers);
  await printExecutionEvidence(apiBase, headers);
}

main().catch((error) => {
  console.error('[FATAL]', error);
  process.exit(1);
});
