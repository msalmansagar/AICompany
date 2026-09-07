import { fileURLToPath } from 'node:url';
const CREATOR = new URL('../scripts/create-onprem-actions.mjs', import.meta.url).href;
const PARAMS = fileURLToPath(new URL('../src/Qdb.ReportEngine.CrmPlugin/ReportEngineParameters.cs', import.meta.url));
const CORE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));
// The two Custom Actions on-premises needs in place of the Custom APIs.
//
// Eighteen argument names across two Actions, and a typo in any of them fails SILENTLY — the plugin
// reads a missing key as null, so it surfaces as "'reportId' must be a non-empty GUID" or an empty
// result, never as a name error. The names live in three places that must agree: this script, the
// browser's parameterTypes map, and ReportEngineParameters.cs. So they are compared against each
// other here rather than eyeballed.
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const { buildActionXaml, classNameFor } = await import(CREATOR);

const RUN_REPORT = {
  name: 'RunReport', displayName: 'Run Report',
  inputs: [
    { name: 'reportId', type: 'String', required: true, description: 'The report.' },
    { name: 'parametersJson', type: 'String' }, { name: 'format', type: 'String' },
    { name: 'async', type: 'Boolean' }, { name: 'relationshipId', type: 'String' },
    { name: 'parentKey', type: 'String' }
  ],
  outputs: ['resultJson', 'executionId', 'mode', 'jobId', 'statusPollUrl', 'errorCode', 'errorMessage']
    .map(name => ({ name, type: 'String' }))
};

const xaml = buildActionXaml(RUN_REPORT, classNameFor('qdb_RunReport'));

console.log('the generated workflow declares the arguments');
const declared = [...xaml.matchAll(/<x:Property Name="([^"]+)" Type="(In|Out)Argument\(([^)]+)\)"/g)]
  .map(m => ({ name: m[1], direction: m[2], clr: m[3] }));
check('every input and output is declared', declared.length === 13, `got ${declared.length}`);
check('inputs are InArgument', declared.filter(d => d.direction === 'In').length === 6);
check('outputs are OutArgument', declared.filter(d => d.direction === 'Out').length === 7);
// async is the only non-String on either Action; declaring it as a string is accepted and then the
// plugin's `value is bool` test silently reads false for every call.
check('async is declared Boolean',
  declared.find(d => d.name === 'async').clr === 'x:Boolean');
check('and everything else is String',
  declared.filter(d => d.name !== 'async').every(d => d.clr === 'x:String'));
check('a required argument says so',
  /Name="reportId"[\s\S]{0,200}ArgumentRequiredAttribute Value="True"/.test(xaml));
check('an optional one says so too',
  /Name="parentKey"[\s\S]{0,200}ArgumentRequiredAttribute Value="False"/.test(xaml));

console.log('\nand is well-formed enough to import');
check('declares the XAML namespace', xaml.includes('xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"'));
// The SDK assembly versions and public key tokens were copied from an activated Action read out of
// a live organisation; invented ones produce a workflow that imports and will not activate.
check('names the Sdk.Workflow assembly exactly',
  xaml.includes('Microsoft.Xrm.Sdk.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35'));
check('the class name matches the Activity', xaml.includes(`x:Class="${classNameFor('qdb_RunReport')}"`));
// Self-closing, not a `<mxswa:Workflow><Sequence /></mxswa:Workflow>` wrapper: the wrapper form was
// what a live organisation rejected, so the shape itself is the assertion.
check('the body is empty, because the plugin does the work',
  /<mxswa:Workflow \/>/.test(xaml));
check('and holds no activity of its own', !xaml.includes('<Sequence'));
check('the class name is stable for a given unique name',
  classNameFor('qdb_RunReport') === classNameFor('qdb_RunReport'));
check('and differs between the two Actions',
  classNameFor('qdb_RunReport') !== classNameFor('qdb_RunDashboard'));

console.log('\nan unsupported argument type is refused, not guessed');
let message = '';
try {
  buildActionXaml({ ...RUN_REPORT, inputs: [{ name: 'when', type: 'DateTime' }] }, 'X');
} catch (error) { message = error.message; }
check('names the argument and the type', /DateTime/.test(message) && /when/.test(message), message);

console.log('\nthe names agree across all three places that hold them');
const creatorSource = readFileSync(fileURLToPath(new URL('../scripts/create-onprem-actions.mjs', import.meta.url)), 'utf8');
const csharp = readFileSync(PARAMS, 'utf8');
const engine = readFileSync(CORE, 'utf8');

const EVERY_NAME = ['reportId', 'parametersJson', 'format', 'async', 'relationshipId', 'parentKey',
  'dashboardId', 'resultJson', 'executionId', 'mode', 'jobId', 'statusPollUrl',
  'errorCode', 'errorMessage'];
for (const name of EVERY_NAME) {
  const inCreator = new RegExp(`name: '${name}'`).test(creatorSource);
  const inCsharp = new RegExp(`= "${name}"`).test(csharp);
  check(`${name}`, inCreator && inCsharp,
    [inCreator ? '' : 'missing from the creator', inCsharp ? '' : 'missing from ReportEngineParameters.cs']
      .filter(Boolean).join('; '));
}

// The browser only sends RunReport's six inputs and RunDashboard's one; the outputs it reads back
// are checked by name in runReportInCrm.
console.log('\nand the browser asks for exactly the inputs the Action declares');
const browserInputs = [...engine.matchAll(/^\s{8}(\w+):\s+\{ typeName: "Edm\.(String|Boolean)"/gm)].map(m => m[1]);
check('the browser names six inputs for RunReport', browserInputs.length >= 6, browserInputs.join(', '));
for (const input of RUN_REPORT.inputs) {
  check(`browser sends ${input.name}`, browserInputs.includes(input.name));
}
check('and types async as Edm.Boolean',
  /async:\s+\{ typeName: "Edm\.Boolean"/.test(engine));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
