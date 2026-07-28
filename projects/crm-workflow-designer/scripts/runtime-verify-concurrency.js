'use strict';

/**
 * CWFD-005 runtime test — the first process execution on org5869857f.
 *
 * Verifies the two behaviours the reconciliation is built on:
 *   1. FAN-OUT   OnTaskCreate (async) creates one task per branch step
 *   2. JOIN GUARD OnTaskComplete (sync) refuses to close a parent while a branch is open
 *
 * Everything it creates is prefixed ZZ_RT_ and deleted in the finally block.
 */

const { loadCrmConfig, getToken, buildHeaders } = require('./scripts/crm-api-client');

const SET = {
  process: 'qdb_work_item_record_types',
  step: 'qdb_work_item_stepses',
  outcome: 'qdb_outcomes',
  task: 'qdb_tasks',
};
// Copied from the working "First Step": the qdb_task record-entity config row and
// the regarding-field config row that resolves to `regardingobjectid`.
const RECORD_ENTITY_CONFIG = '1458c087-c35d-f111-a825-7ced8d96ec97';
const REGARDING_FIELD_CONFIG = 'ca5ac3d7-c35d-f111-a825-7ced8d96ec97';

let pass = 0;
let fail = 0;
const created = { tasks: [], outcomes: [], steps: [], processes: [] };

function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function api(cfg, token, method, path, body) {
  const res = await fetch(`${cfg.apiBase}/${path}`, {
    method,
    headers: buildHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = res.ok ? '' : await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return res;
}

async function get(cfg, token, path) {
  return (await api(cfg, token, 'GET', path)).json();
}

function idFrom(res) {
  return res.headers.get('OData-EntityId').match(/\(([^)]+)\)/)[1];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const cfg = loadCrmConfig();
  const token = await getToken(cfg);
  console.log('\n══ CWFD-005 runtime test — first execution on org5869857f ══\n');

  const account = (await get(cfg, token, 'accounts?$select=accountid,name&$top=1')).value[0];
  if (!account) throw new Error('no account to regard the task to');
  console.log(`  regarding record: ${account.name}\n`);

  // --- config: process, parent step, branch step, guarding outcome
  const processId = idFrom(await api(cfg, token, 'POST', SET.process, {
    qdb_name: 'ZZ_RT_PROCESS',
    [`qdb_RecordEntity@odata.bind`]: `/crmi_autonumber_system_entitieses(${RECORD_ENTITY_CONFIG})`,
    [`qdb_RegardingField@odata.bind`]: `/crmi_autonumber_entities_fieldses(${REGARDING_FIELD_CONFIG})`,
  }));
  created.processes.push(processId);

  const buildStep = (name, seq, extra = {}) => ({
    qdb_name: name,
    qdb_sequenceno: seq,
    qdb_tasksubject: name,
    qdb_task_assign_to: 100000000,
    [`qdb_record_type@odata.bind`]: `/${SET.process}(${processId})`,
    [`qdb_RecordEntity@odata.bind`]: `/crmi_autonumber_system_entitieses(${RECORD_ENTITY_CONFIG})`,
    [`qdb_RegardingField@odata.bind`]: `/crmi_autonumber_entities_fieldses(${REGARDING_FIELD_CONFIG})`,
    ...extra,
  });

  const parentStepId = idFrom(await api(cfg, token, 'POST', SET.step, buildStep('ZZ_RT_PARENT', 1)));
  created.steps.push(parentStepId);

  const branchStepId = idFrom(await api(cfg, token, 'POST', SET.step, buildStep('ZZ_RT_BRANCH', 2, {
    [`qdb_ParentWorkItemStep@odata.bind`]: `/${SET.step}(${parentStepId})`,
  })));
  created.steps.push(branchStepId);

  const outcomeId = idFrom(await api(cfg, token, 'POST', SET.outcome, {
    qdb_name: 'ZZ_RT_DONE',
    qdb_sequencenumber: 1,
    qdb_checkparalleltasks: true,
    [`qdb_WorkItemStep@odata.bind`]: `/${SET.step}(${parentStepId})`,
  }));
  created.outcomes.push(outcomeId);

  console.log('  config created: process + parent step + branch step + guarding outcome\n');

  try {
    // --- 1. FAN-OUT
    const parentTaskId = idFrom(await api(cfg, token, 'POST', SET.task, {
      subject: 'ZZ_RT_TASK',
      [`qdb_worktask_qdb_task@odata.bind`]: `/${SET.step}(${parentStepId})`,
      [`qdb_recordtype_qdb_task@odata.bind`]: `/${SET.process}(${processId})`,
      [`regardingobjectid_account_qdb_task@odata.bind`]: `/accounts(${account.accountid})`,
    }));
    created.tasks.push(parentTaskId);
    console.log(`  created ONE task (${parentTaskId})`);
    console.log('  waiting for OnTaskCreate (async) to fan out…');

    let branchTasks = [];
    for (let attempt = 1; attempt <= 12; attempt++) {
      await sleep(5000);
      const found = await get(
        cfg, token,
        `${SET.task}?$select=activityid,subject,_qdb_worktask_value,_qdb_parenttask_value` +
        `&$filter=_qdb_parenttask_value eq ${parentTaskId}`
      );
      branchTasks = found.value;
      if (branchTasks.length > 0) break;
      process.stdout.write(`    …${attempt * 5}s\r`);
    }
    branchTasks.forEach((task) => created.tasks.push(task.activityid));

    console.log('');
    check('fan-out: the engine created a task for the branch step', branchTasks.length === 1,
      `${branchTasks.length} branch task(s)`);
    if (branchTasks.length === 1) {
      check('fan-out: the branch task points at the branch step',
        branchTasks[0]._qdb_worktask_value === branchStepId);
      check('fan-out: the branch task is parented to the originating task',
        branchTasks[0]._qdb_parenttask_value === parentTaskId);
    }

    // --- 2. JOIN GUARD (synchronous — expect a refusal)
    if (branchTasks.length > 0) {
      console.log('\n  attempting to complete the parent while its branch is open…');
      let guardFired = false;
      let message = '';
      try {
        await api(cfg, token, 'PATCH', `${SET.task}(${parentTaskId})`, {
          statecode: 1,
          statuscode: 2,
          [`qdb_Decision_qdb_task@odata.bind`]: `/${SET.outcome}(${outcomeId})`,
        });
      } catch (error) {
        guardFired = true;
        message = error.message;
      }
      check('join guard: completion refused while a branch is open', guardFired);
      if (guardFired) {
        const mentionsParallel = /parallel/i.test(message);
        check('join guard: the refusal explains why', mentionsParallel,
          message.slice(message.indexOf('parallel') - 40, message.indexOf('parallel') + 60).trim() || message.slice(0, 120));
      }
    }
  } finally {
    console.log('\n  cleaning up…');
    for (const id of created.tasks) {
      try { await api(cfg, token, 'DELETE', `${SET.task}(${id})`); } catch (e) { console.log('    task delete failed:', e.message.slice(0, 90)); }
    }
    for (const id of created.outcomes) {
      try { await api(cfg, token, 'DELETE', `${SET.outcome}(${id})`); } catch (e) { console.log('    outcome delete failed:', e.message.slice(0, 90)); }
    }
    for (const id of [...created.steps].reverse()) {
      try { await api(cfg, token, 'DELETE', `${SET.step}(${id})`); } catch (e) { console.log('    step delete failed:', e.message.slice(0, 90)); }
    }
    for (const id of created.processes) {
      try { await api(cfg, token, 'DELETE', `${SET.process}(${id})`); } catch (e) { console.log('    process delete failed:', e.message.slice(0, 90)); }
    }
    console.log('  cleanup done');
  }

  console.log(`\n══ ${pass} passed, ${fail} failed ══\n`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error('\n[FATAL]', err.message ?? err);
  process.exit(1);
});
