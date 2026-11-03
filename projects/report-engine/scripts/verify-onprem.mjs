// Answers "will the Report Engine actually run here?" against a live organisation.
//
// Written because that question kept being answered from memory, on both sides. Every check below
// reads the organisation and reports PASS, FAIL or a warning with the thing to do about it. It
// writes nothing.
//
// Usage: node verify-onprem.mjs <path-to-.env>
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { connect } from './lib/dataverse.mjs';

const PROTOTYPE = resolve(dirname(fileURLToPath(import.meta.url)), '../prototype');

/* The eighteen names are the contract between the browser, the Action and the plugin. A missing one
   never says so: the plugin reads it as null and the run fails somewhere else entirely. */
const MESSAGES = {
  qdb_RunReport: {
    plugin: 'RunReportPlugin',
    activity: 'RunReportActivity',
    inputs: ['reportId', 'parametersJson', 'format', 'async', 'relationshipId', 'parentKey'],
    outputs: ['resultJson', 'executionId', 'mode', 'jobId', 'statusPollUrl', 'errorCode', 'errorMessage']
  },
  qdb_RunDashboard: {
    plugin: 'RunDashboardPlugin',
    activity: 'RunDashboardActivity',
    inputs: ['dashboardId'],
    outputs: ['resultJson', 'executionId', 'errorCode', 'errorMessage']
  }
};

/* Deployed by deploy-webresources.mjs. The shells are what go stale unnoticed, because a solution
   exported before a fix carries the old bytes and nothing says so. */
const WEB_RESOURCES = [
  ['qdb_reportengine_core.js', 'report-engine-core.js'],
  ['qdb_reportengine_core.css', 'report-engine-core.css'],
  ['qdb_reportengine_designer.html', 'report-designer.html'],
  ['qdb_reportengine_runtime.html', 'report-runtime.html'],
  ['qdb_reportengine_report.html', 'report-single.html'],
  ['qdb_reportengine_ribbon.js', 'report-ribbon.js']
];

const results = [];
const record = (state, title, detail, fix) => {
  results.push({ state, title, detail, fix });
  const mark = { pass: '  ✅', fail: '  ❌', warn: '  ⚠️ ' }[state];
  console.log(`${mark} ${title}${detail ? ' — ' + detail : ''}`);
  if (state !== 'pass' && fix) console.log(`        → ${fix}`);
};

const dv = await connect(process.argv[2]);
console.log(`\n== Report Engine readiness — ${dv.baseUrl} ==`);
console.log(`   Web API v${dv.apiVersion}, auth ${dv.authMode}\n`);

const count = async query => {
  try { return (await dv.fetchJson(query)).value.length; } catch { return -1; }
};

/* ---------------- 1. The messages the browser calls ---------------- */
console.log('The messages every report run goes through');
for (const [name, spec] of Object.entries(MESSAGES)) {
  let message = null;
  try {
    const found = await dv.fetchJson(`sdkmessages?$select=sdkmessageid,name&$filter=name eq '${name}'`);
    message = found.value[0] || null;
  } catch (error) {
    record('fail', name, `could not be queried: ${error.message}`);
    continue;
  }
  if (!message) {
    record('fail', name, 'the message does not exist',
      'Create it as a Custom Action — see onprem-actions-build-sheet.md. Every run 404s until then.');
    continue;
  }
  record('pass', name, 'message exists');

  // The parameters are what silently drift, so they are compared name by name.
  try {
    const pairs = await dv.fetchJson(
      `sdkmessagepairs?$select=sdkmessagepairid&$filter=_sdkmessageid_value eq ${message.sdkmessageid}`);
    if (!pairs.value.length) { record('fail', `${name} parameters`, 'no message pair'); continue; }
    const pid = pairs.value[0].sdkmessagepairid;
    /* Two hops via lookup values rather than one via a navigation property. The single-hop form
       (sdkmessagerequest/_sdkmessagepairid_value) is rejected — there is no such property — and it
       failed as a warning, which reads as "could not check" when the real answer was available. */
    const requests = await dv.fetchJson(
      `sdkmessagerequests?$select=sdkmessagerequestid&$filter=_sdkmessagepairid_value eq ${pid}`);
    const have = new Set();
    const haveOut = new Set();
    for (const request of requests.value) {
      const inputs = await dv.fetchJson(
        `sdkmessagerequestfields?$select=name&$filter=_sdkmessagerequestid_value eq ${request.sdkmessagerequestid}`);
      inputs.value.forEach(f => have.add(f.name));
      // A response hangs off its request, not off the pair — the pair has no responses of its own.
      const responses = await dv.fetchJson(
        `sdkmessageresponses?$select=sdkmessageresponseid&$filter=_sdkmessagerequestid_value eq ${request.sdkmessagerequestid}`);
      for (const response of responses.value) {
        const outputs = await dv.fetchJson(
          `sdkmessageresponsefields?$select=name&$filter=_sdkmessageresponseid_value eq ${response.sdkmessageresponseid}`);
        outputs.value.forEach(f => haveOut.add(f.name));
      }
    }
    const missingIn = spec.inputs.filter(n => !have.has(n));
    const missingOut = spec.outputs.filter(n => !haveOut.has(n));
    if (missingIn.length || missingOut.length) {
      record('fail', `${name} parameters`,
        [missingIn.length ? `missing inputs: ${missingIn.join(', ')}` : '',
         missingOut.length ? `missing outputs: ${missingOut.join(', ')}` : ''].filter(Boolean).join('; '),
        'Names are case-sensitive. A missing one reads as null in the plugin, never as a name error.');
    } else {
      record('pass', `${name} parameters`, `${spec.inputs.length} in, ${spec.outputs.length} out, all present`);
    }
  } catch (error) {
    record('warn', `${name} parameters`, `could not be read: ${error.message}`);
  }
}

/* ---------------- 2. The plugin, and whether anything is bound to it ---------------- */
console.log('\nThe plugin');
let types = [];
try {
  const assemblies = await dv.fetchJson(
    "pluginassemblies?$select=pluginassemblyid,name,version&$filter=name eq 'Qdb.ReportEngine.CrmPlugin'");
  if (!assemblies.value.length) {
    record('fail', 'assembly', 'Qdb.ReportEngine.CrmPlugin is not registered',
      'Register bin/Release/net462/Qdb.ReportEngine.CrmPlugin.dll with the Plugin Registration Tool.');
  } else {
    const assembly = assemblies.value[0];
    record('pass', 'assembly', `registered, version ${assembly.version}`);
    const found = await dv.fetchJson(
      `plugintypes?$select=plugintypeid,typename&$filter=_pluginassemblyid_value eq ${assembly.pluginassemblyid}`);
    types = found.value;
    record(types.length >= 3 ? 'pass' : 'warn', 'plugin types', types.map(t => t.typename.split('.').pop()).join(', '));
  }
} catch (error) {
  record('warn', 'assembly', `could not be read: ${error.message}`);
}

/* Two different shapes reach the same code, and only one of them registers a step.
     cloud      — a Custom API, with the plugin registered on its message.
     on-premise — a Process Action whose body contains a Custom Workflow Activity.
   An earlier version of this check knew only the first, so on-premise it would have reported "no
   step registered" as a blocker against a correctly built system and sent someone chasing it. */
console.log('\nHow the message is implemented — a plugin step, or an activity inside the Action');
for (const [name, spec] of Object.entries(MESSAGES)) {
  try {
    const workflows = await dv.fetchJson(
      `workflows?$select=uniquename,statecode,xaml&$filter=uniquename eq '${name}' and category eq 3`);
    const action = workflows.value[0];
    if (action && (action.xaml || '').includes(spec.activity)) {
      const live = action.statecode === 1;
      record(live ? 'pass' : 'fail', `${name} implementation`,
        `Process Action containing ${spec.activity}${live ? '' : ' — NOT ACTIVATED'}`,
        'Activate the Action, or it is not a callable message.');
      continue;
    }
    if (action) {
      record('fail', `${name} implementation`,
        'a Process Action exists but its body does not contain the activity',
        `Add ${spec.activity} as a step inside the Action and map the arguments onto it.`);
      continue;
    }

    const steps = await dv.fetchJson(
      `sdkmessageprocessingsteps?$select=name,stage,mode,statecode&$filter=sdkmessageid/name eq '${name}'`);
    if (!steps.value.length) {
      record('fail', `${name} implementation`, 'no plugin step and no Process Action',
        `On-premise: create the Action and add ${spec.activity} as a step inside it. Cloud: register ${spec.plugin} on the message.`);
      continue;
    }
    const active = steps.value.filter(s => s.statecode === 0);
    const STAGE = { 20: 'PreOperation', 30: 'MainOperation', 40: 'PostOperation' };
    const detail = steps.value
      .map(s => `${STAGE[s.stage] || 'stage ' + s.stage}/${s.mode === 0 ? 'sync' : 'async'}${s.statecode === 0 ? '' : ' DISABLED'}`)
      .join(', ');
    /* Both 30 and 40 are legitimate and it depends on what the message is: a Custom API's
       implementation runs at MainOperation (30) — which is what the working cloud deployment uses —
       while a plugin on a Custom Action normally runs at PostOperation (40). So the stage is
       reported rather than asserted. An earlier version of this check called the cloud system's own
       working registration wrong, which is exactly the kind of false alarm that gets a checker
       ignored. */
    const unexpected = active.filter(s => s.stage !== 30 && s.stage !== 40);
    if (!active.length) {
      record('warn', `${name} implementation`, `${detail} — none active`, 'Enable the step, or it does nothing.');
    } else if (unexpected.length) {
      record('warn', `${name} implementation`, detail,
        'Expected MainOperation (Custom API) or PostOperation (Custom Action).');
    } else {
      record('pass', `${name} implementation`, detail);
    }
  } catch (error) {
    record('warn', `${name} implementation`, `could not be read: ${error.message}`);
  }
}

const auditSteps = await count(
  "sdkmessageprocessingsteps?$select=name&$filter=sdkmessagefilterid/primaryobjecttypecode eq 'qdb_reportdefinition'");
record(auditSteps >= 3 ? 'pass' : 'warn', 'configuration audit steps', `${auditSteps} on qdb_reportdefinition`,
  'Expected 3 (Create, Update, Delete). Run register-audit-steps.mjs.');

/* ---------------- 3. Are the web resources the current build? ---------------- */
console.log('\nWeb resources — a solution exported before a fix carries the old bytes silently');
for (const [name, file] of WEB_RESOURCES) {
  try {
    const found = await dv.fetchJson(
      `webresourceset?$select=name,content&$filter=name eq '${name}'`);
    if (!found.value.length) {
      record('fail', name, 'not present', 'node scripts/deploy-webresources.mjs <env>');
      continue;
    }
    /* deploy-webresources stamps ?v=<hash of the engine> into every HTML shell before upload, so the
       stored bytes never equal the file on disk and a plain comparison called both shells stale
       while the deploy script itself reported nothing changed. Compare with the stamp removed. */
    const unstamped = text => text.replace(/\?v=[0-9a-f]+/g, '');
    const live = unstamped(Buffer.from(found.value[0].content, 'base64').toString('utf8'));
    const local = unstamped(readFileSync(resolve(PROTOTYPE, file), 'utf8'));
    const same = createHash('sha256').update(live).digest('hex')
      === createHash('sha256').update(local).digest('hex');
    record(same ? 'pass' : 'warn', name, same ? 'matches this build' : 'DIFFERS from this build',
      'Redeploy: node scripts/deploy-webresources.mjs <env>. Old copies hardcode /api/data/v9.2/, which 404s on 9.1 and looks like a permissions problem.');
  } catch (error) {
    record('warn', name, `could not be read: ${error.message}`);
  }
}

/* ---------------- 4. Is there anything to run? ---------------- */
console.log('\nData — the solution carries none of this');
const definitions = await count('qdb_reportdefinitions?$select=qdb_reportdefinitionid&$top=200');
record(definitions > 0 ? 'pass' : 'fail', 'report definitions', `${definitions} found`,
  'The catalogue will be empty. Create one by hand and prove it end to end before migrating the rest.');
const placements = await count('qdb_reportribbonplacements?$select=qdb_reportribbonplacementid&$top=200');
record(placements > 0 ? 'pass' : 'warn', 'ribbon placements', `${placements} found`,
  'The Reports flyout will be empty. node scripts/seed-ribbon-placements.mjs <env>');

/* ---------------- verdict ---------------- */
const failed = results.filter(r => r.state === 'fail');
const warned = results.filter(r => r.state === 'warn');
console.log(`\n${'='.repeat(60)}`);
if (failed.length === 0) {
  console.log(`READY — ${results.length - warned.length} checks passed, ${warned.length} warning(s).`);
  console.log('Now prove it by a CHANGE in result, not by a run that returns rows:');
  console.log('  · run a report, then run one with a filter that must return fewer');
  console.log('  · read errorCode, NOT the HTTP status — a refusal arrives as HTTP 200');
  console.log('  · confirm qdb_reportexecutionlog gained a row');
} else {
  console.log(`NOT READY — ${failed.length} blocker(s):`);
  failed.forEach(f => console.log(`  ❌ ${f.title}${f.detail ? ' — ' + f.detail : ''}`));
}
if (warned.length) {
  console.log(`\n${warned.length} warning(s):`);
  warned.forEach(w => console.log(`  ⚠️  ${w.title}${w.detail ? ' — ' + w.detail : ''}`));
}
console.log();
process.exit(failed.length ? 1 : 0);
