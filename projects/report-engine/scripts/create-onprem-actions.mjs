// Creates the two Custom Actions the engine runs on: qdb_RunReport and qdb_RunDashboard.
//
// On-premises 9.1 has no Custom API, so the messages the browser calls have to exist as Custom
// Actions instead. The plugin does not change — it reads InputParameters and writes OutputParameters
// by name, which is identical under either — and the web resources do not change, because they
// already invoke an unbound Action (operationType 0). Only the message definitions are missing.
//
// This exists instead of a click-by-click build sheet because there are eighteen argument names
// across the two Actions, and a typo in any of them fails SILENTLY: the plugin reads a missing key
// as null, so you get "'reportId' must be a non-empty GUID" or an empty result, not a name error.
// The names below are the contract, taken from ReportEngineParameters.cs and the browser's
// parameterTypes map.
//
// Usage: node create-onprem-actions.mjs <path-to-.env> [--prefix qdb] [--dry-run]
//
// ⚠️ NOT YET RUN AGAINST ANY ORGANISATION. The XAML shape is modelled on real activated Actions read
// out of org5869857f, but a workflow that imports and will not activate is a real possibility. Run
// with --dry-run first, and treat the first live run as a test of this script.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { connect } from './lib/dataverse.mjs';

/* The contract. Order is irrelevant; spelling and direction are not. */
const ACTIONS = [
  {
    name: 'RunReport',
    displayName: 'Report Engine — Run Report',
    plugin: 'Qdb.ReportEngine.CrmPlugin.RunReportPlugin',
    inputs: [
      { name: 'reportId', type: 'String', required: true, description: 'Id of the qdb_reportdefinition to run.' },
      { name: 'parametersJson', type: 'String', description: 'Runtime parameter values as JSON. "{}" when there are none.' },
      { name: 'format', type: 'String', description: 'RUN for an on-screen run.' },
      { name: 'async', type: 'Boolean', description: 'Reserved. The engine runs synchronously today.' },
      { name: 'relationshipId', type: 'String', description: 'Drilldown only: which relationship to follow.' },
      { name: 'parentKey', type: 'String', description: 'Drilldown only: the parent row key the child query is scoped to.' }
    ],
    outputs: [
      { name: 'resultJson', type: 'String', description: 'The shaped result. Empty on failure.' },
      { name: 'executionId', type: 'String', description: 'Correlation id, also written to the execution log.' },
      { name: 'mode', type: 'String', description: 'SYNC.' },
      { name: 'jobId', type: 'String', description: 'Reserved for asynchronous runs.' },
      { name: 'statusPollUrl', type: 'String', description: 'Reserved for asynchronous runs.' },
      { name: 'errorCode', type: 'String', description: 'Empty on success. A refusal arrives here with HTTP 200.' },
      { name: 'errorMessage', type: 'String', description: 'Empty on success.' }
    ]
  },
  {
    name: 'RunDashboard',
    displayName: 'Report Engine — Run Dashboard',
    plugin: 'Qdb.ReportEngine.CrmPlugin.RunDashboardPlugin',
    inputs: [
      { name: 'dashboardId', type: 'String', required: true, description: 'Id of the dashboard to run.' }
    ],
    outputs: [
      { name: 'resultJson', type: 'String', description: 'The shaped result. Empty on failure.' },
      { name: 'executionId', type: 'String', description: 'Correlation id, also written to the execution log.' },
      { name: 'errorCode', type: 'String', description: 'Empty on success.' },
      { name: 'errorMessage', type: 'String', description: 'Empty on success.' }
    ]
  }
];

/* Argument CLR types, in the namespace prefixes the XAML header declares. Only the two the engine
   actually uses are here; adding a third means adding its namespace too, so it is deliberately
   not open-ended. */
const CLR_TYPE = { String: 'x:String', Boolean: 'x:Boolean' };

const xmlEscape = text => String(text).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** One `<x:Property>`, which is how a workflow declares an argument. */
function argumentXaml(argument, direction) {
  const clr = CLR_TYPE[argument.type];
  if (!clr) throw new Error(`Unsupported argument type "${argument.type}" on ${argument.name}.`);
  return `<x:Property Name="${xmlEscape(argument.name)}" Type="${direction}Argument(${clr})">`
    + `<x:Property.Attributes>`
    + `<mxsw:ArgumentRequiredAttribute Value="${argument.required ? 'True' : 'False'}" />`
    + `<mxsw:ArgumentTargetAttribute Value="False" />`
    + `<mxsw:ArgumentDescriptionAttribute Value="${xmlEscape(argument.description || argument.name)}" />`
    + `</x:Property.Attributes></x:Property>`;
}

/* The namespace header, copied from an activated Action read out of a live organisation rather than
   written from memory — the assembly versions and public key tokens have to be exact. */
const XAML_NAMESPACES = [
  'xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"',
  'xmlns:mva="clr-namespace:Microsoft.VisualBasic.Activities;assembly=System.Activities, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35"',
  'xmlns:mxs="clr-namespace:Microsoft.Xrm.Sdk;assembly=Microsoft.Xrm.Sdk, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35"',
  'xmlns:mxsw="clr-namespace:Microsoft.Xrm.Sdk.Workflow;assembly=Microsoft.Xrm.Sdk.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35"',
  'xmlns:mxswa="clr-namespace:Microsoft.Xrm.Sdk.Workflow.Activities;assembly=Microsoft.Xrm.Sdk.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35"',
  'xmlns:s="clr-namespace:System;assembly=mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089"',
  'xmlns:scg="clr-namespace:System.Collections.Generic;assembly=mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089"',
  'xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"'
].join(' ');

/**
 * The workflow definition for one Action: arguments, and a body that does nothing.
 *
 * The body is empty on purpose. The plugin registered on this message does the work; the Action
 * exists only to define the message and its parameters.
 */
export function buildActionXaml(action, className) {
  const properties = action.inputs.map(a => argumentXaml(a, 'In'))
    .concat(action.outputs.map(a => argumentXaml(a, 'Out')))
    .join('');

  return `<?xml version="1.0" encoding="utf-16"?>`
    + `<Activity x:Class="${className}" ${XAML_NAMESPACES}>`
    + `<x:Members>${properties}</x:Members>`
    + `<this:${className}.Workflow>`
    + `<mxswa:Workflow>`
    + `<Sequence DisplayName="${xmlEscape(action.displayName)}" />`
    + `</mxswa:Workflow>`
    + `</this:${className}.Workflow>`
    + `</Activity>`;
}

/** CRM names the generated class XrmWorkflow<32 hex>; it only has to be unique and stable. */
export const classNameFor = uniqueName =>
  'XrmWorkflow' + [...uniqueName].reduce((hash, ch) =>
    (hash * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16).padStart(8, '0').repeat(4);

async function findExisting(dv, uniqueName) {
  const filter = encodeURIComponent(`uniquename eq '${uniqueName}'`);
  const page = await dv.fetchJson(`workflows?$select=workflowid,uniquename,statecode&$filter=${filter}`);
  return page.value[0] || null;
}

async function createAction(dv, action, prefix, dryRun) {
  const uniqueName = `${prefix}_${action.name}`;
  const className = classNameFor(uniqueName);
  const xaml = buildActionXaml(action, className);

  const existing = await findExisting(dv, uniqueName);
  if (existing) {
    console.log(`  · ${uniqueName} already exists (statecode ${existing.statecode}) — left alone`);
    return existing.workflowid;
  }
  if (dryRun) {
    console.log(`  · ${uniqueName} would be created — ${action.inputs.length} in, ${action.outputs.length} out, ${xaml.length} chars of XAML`);
    return null;
  }

  // category 3 = Action, type 1 = Definition, scope 4 = Organization, primaryentity none = global.
  const body = JSON.stringify({
    name: action.displayName,
    uniquename: uniqueName,
    category: 3,
    type: 1,
    scope: 4,
    primaryentity: 'none',
    languagecode: 1033,
    xaml
  });
  const created = await dv.fetchJson('workflows', { method: 'POST', body });
  const id = created && created.workflowid;
  console.log(`  ✓ created ${uniqueName}`);

  // An unactivated Action is not a callable message, so this is not optional.
  await dv.fetchJson(`workflows(${id})`, {
    method: 'PATCH', body: JSON.stringify({ statecode: 1, statuscode: 2 })
  });
  console.log(`  ✓ activated ${uniqueName}`);
  return id;
}

/* Importing this module must not create anything. The XAML builders above are pure and are
   tested directly; everything below runs only when the file is invoked as a script. */
const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
const envPath = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const prefixArg = process.argv.indexOf('--prefix');
const prefix = prefixArg > 0 ? process.argv[prefixArg + 1] : 'qdb';

const dv = await connect(envPath);
console.log(`\n== ${dryRun ? 'DRY RUN — ' : ''}Create Report Engine Actions on ${dv.baseUrl} ==`);
console.log(`   Web API v${dv.apiVersion}, auth ${dv.authMode}, prefix "${prefix}"\n`);

for (const action of ACTIONS) {
  await createAction(dv, action, prefix, dryRun);
}

console.log(`
Next, and NOT done by this script — register the plugin steps:`);
for (const action of ACTIONS) {
  console.log(`   ${action.plugin}`);
  console.log(`     on message ${prefix}_${action.name}, PostOperation, synchronous, no primary entity`);
}
console.log(`
Then prove it by a CHANGE in result, not by a run that returns rows:
  - deactivate the step, run again, and confirm you get an empty result rather than data
  - read errorCode, not the status code: a refusal arrives as HTTP 200
  - confirm qdb_reportexecutionlog gained a row
`);
}
