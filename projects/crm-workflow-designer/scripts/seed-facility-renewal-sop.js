'use strict';

/**
 * seed-facility-renewal-sop.js
 *
 * Creates the "Facility Renewal – Long Path" SOP in Dataverse, replicating
 * the reference process diagram with all roles, steps, and outcome connections.
 *
 * Safe to re-run — checks for duplicate SOP by name before creating.
 *
 * Usage:
 *   $env:AZURE_CLIENT_SECRET="..."; node scripts/seed-facility-renewal-sop.js
 */

const TENANT_ID     = process.env.AZURE_TENANT_ID     ?? 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = process.env.AZURE_CLIENT_ID     ?? '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const ORG_URL       = process.env.DATAVERSE_URL        ?? 'https://org5869857f.crm4.dynamics.com';
const API           = `${ORG_URL}/api/data/v9.2`;

// ── Option-set values (matches qdb_steptypecode in SopTypes.ts) ───────────────
const TYPE = {
  step:         100000000,
  approval:     100000002,
  notification: 100000006,
};

// ── Role definitions ──────────────────────────────────────────────────────────
const ROLE_DEFS = [
  { alias: 'bfd',   name: 'BFD / Remedial RM',                   department: 'Business Finance & Development' },
  { alias: 'fa',    name: 'Financial Analyst (FFSAE)',            department: 'FFSAE' },
  { alias: 'hf',    name: 'Head of FFSAE',                        department: 'FFSAE' },
  { alias: 'smif',  name: 'Sr. Manager Industrial Financing',     department: 'Industrial Financing' },
  { alias: 'mase',  name: 'Manager of ASE',                       department: 'ASE' },
  { alias: 'ca',    name: 'Credit Analyst (ASE)',                  department: 'ASE' },
  { alias: 'smca',  name: 'Sr. Manager Credit Analysis',          department: 'Credit Analysis' },
  { alias: 'icc',   name: 'ICC Committee',                        department: 'ICC' },
];

// ── Step definitions ──────────────────────────────────────────────────────────
// alias = internal key used to wire up outcomes; seq = sequenceNo in SOP
const STEP_DEFS = [
  {
    alias: 's1', seq: 1,
    name: 'Receives task and checks the renewal request',
    desc: 'Receives task and checks the renewal request. Ensures all the required documents are updated.',
    role: 'bfd', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's2', seq: 2,
    name: 'Financial Analyst reviews auto-generated financial forecasting report',
    desc: 'Financial Analyst receives task and reviews auto-generated financial forecasting report and provides recommendation and attaches document, if required.',
    role: 'fa', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's3', seq: 3,
    name: 'Head of FFSAE reviews the report and recommendation',
    desc: 'Head of FFSAE reviews the report and recommendation.',
    role: 'hf', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's4', seq: 4,
    name: '3.1 – In case of amendments, returns task to Financial Analyst',
    desc: 'In case of amendments, returns task to Financial Analyst.',
    role: 'hf', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's5', seq: 5,
    name: '3.2 – Approves the task',
    desc: 'Approves the task.',
    role: 'hf', type: TYPE.approval, channel: 'crm',
  },
  {
    alias: 's6', seq: 6,
    name: '4 – Receives financial forecasting report, completes memo and sends to Sr. Manager',
    desc: 'Receives the financial forecasting report, completes the memo and send task to Sr. Manager of Industrial Financing for review.',
    role: 'bfd', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's7', seq: 7,
    name: '5 – Reviews the facility renewal request',
    desc: 'Reviews the facility renewal request.',
    role: 'smif', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's8', seq: 8,
    name: '5.1 – Returns task to RM',
    desc: 'Returns task to RM.',
    role: 'smif', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's9', seq: 9,
    name: '5.2 – Sends the task to ASE',
    desc: 'Sends the task to ASE.',
    role: 'smif', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's10', seq: 10,
    name: '6 – Manager of ASE receives task and assigns to available Credit Analyst',
    desc: 'Manager of ASE receives task on CRM and assigns the task to available Credit Analyst.',
    role: 'mase', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's11', seq: 11,
    name: '7 – Credit Analyst receives task for preparing credit proposal',
    desc: 'Credit Analyst receives task for preparing credit proposal.',
    role: 'ca', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's12', seq: 12,
    name: '7.1 – Returns task to RM with comments',
    desc: 'Returns task to RM with comments.',
    role: 'mase', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's13', seq: 13,
    name: '7.2 – Prepares credit proposal, provides recommendation, and submits to Manager of ASE',
    desc: 'Prepares credit proposal, provides recommendation, and submits to Manager of ASE for approval.',
    role: 'ca', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's14', seq: 14,
    name: '8 – Manager of ASE reviews and approves the Credit Proposal',
    desc: 'Manager of ASE reviews and approves the Credit Proposal.',
    role: 'mase', type: TYPE.approval, channel: 'crm',
  },
  {
    alias: 's15', seq: 15,
    name: '9 – Sr. Manager Credit Analysis receives task and reviews credit proposal',
    desc: 'Receives task on CRM and reviews credit proposal.',
    role: 'smca', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's16', seq: 16,
    name: '9.1 – Sends comments to Credit Analyst to update the credit proposal',
    desc: 'Sends comments to Credit Analyst to update the credit proposal.',
    role: 'smca', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's17', seq: 17,
    name: '9.2 – Approves proposal for submission to ICC',
    desc: 'Approves proposal for submission to ICC.',
    role: 'smca', type: TYPE.approval, channel: 'crm',
  },
  {
    alias: 's18', seq: 18,
    name: '10 – Manager of ASE creates ICC Agenda in CRM',
    desc: 'Manager of ASE will create ICC Agenda in CRM, add the proposal and date/time of ICC.',
    role: 'mase', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's19', seq: 19,
    name: '11 – ICC reviews proposal presented by RM & Credit Analysis',
    desc: 'Review proposal which is presented by RM & Credit Analysis.',
    role: 'icc', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's20', seq: 20,
    name: '11.1 – Returns task to Concerned RM',
    desc: 'Returns task to Concerned RM.',
    role: 'icc', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's21', seq: 21,
    name: '11.2 – Rejects the case & provides valid rejection comments',
    desc: 'Rejects the case & provides valid rejection comments.',
    role: 'icc', type: TYPE.step, channel: 'crm',
  },
  {
    alias: 's22', seq: 22,
    name: '11.3 – Approves the case',
    desc: 'Approves the case.',
    role: 'icc', type: TYPE.approval, channel: 'crm',
  },
  {
    alias: 's23', seq: 23,
    name: '11.3.2 – Closes task & sends rejection notification to Client',
    desc: 'Receives task & reviews the rejection comments. Closes the task & rejection notification along with valid reason is sent to Client.',
    role: 'bfd', type: TYPE.notification, channel: 'crm',
  },
  {
    alias: 's24', seq: 24,
    name: '11.3.1 – Updates termsheet with valid rejection reason and closes task',
    desc: 'Receive the task and update the termsheet with valid rejection reason and closes the task.',
    role: 'mase', type: TYPE.step, channel: 'crm',
  },
];

// ── Outcome (connection) definitions ─────────────────────────────────────────
// from/to = step alias; null to = terminal (connects to End node on canvas)
const OUTCOME_DEFS = [
  { from: 's1',  to: 's2',   name: 'Next',                       seq: 1 },
  { from: 's2',  to: 's3',   name: 'Next',                       seq: 1 },
  { from: 's3',  to: 's5',   name: 'Y – Approved',               seq: 1 },
  { from: 's3',  to: 's4',   name: 'N – Amendments Required',    seq: 2 },
  { from: 's4',  to: 's2',   name: 'Next',                       seq: 1 },  // loop → Financial Analyst
  { from: 's5',  to: 's6',   name: 'Next',                       seq: 1 },
  { from: 's6',  to: 's7',   name: 'Next',                       seq: 1 },
  { from: 's7',  to: 's9',   name: 'Y – Approved',               seq: 1 },
  { from: 's7',  to: 's8',   name: 'N – Rejected',               seq: 2 },
  { from: 's8',  to: 's1',   name: 'Next',                       seq: 1 },  // loop → BFD RM
  { from: 's9',  to: 's10',  name: 'Next',                       seq: 1 },
  { from: 's10', to: 's11',  name: 'Next',                       seq: 1 },
  { from: 's11', to: 's13',  name: 'Y – Proceed',                seq: 1 },
  { from: 's11', to: 's12',  name: 'N – Return to RM',           seq: 2 },
  { from: 's12', to: 's6',   name: 'Next',                       seq: 1 },  // loop → BFD step 4
  { from: 's13', to: 's14',  name: 'Next',                       seq: 1 },
  { from: 's14', to: 's15',  name: 'Next',                       seq: 1 },
  { from: 's15', to: 's17',  name: 'Y – Approved',               seq: 1 },
  { from: 's15', to: 's16',  name: 'N – Revision Required',      seq: 2 },
  { from: 's16', to: 's11',  name: 'Next',                       seq: 1 },  // loop → Credit Analyst
  { from: 's17', to: 's18',  name: 'Next',                       seq: 1 },
  { from: 's18', to: 's19',  name: 'Next',                       seq: 1 },
  { from: 's19', to: 's22',  name: 'Approve',                    seq: 1 },
  { from: 's19', to: 's21',  name: 'Reject',                     seq: 2 },
  { from: 's19', to: 's20',  name: 'Re-submit',                  seq: 3 },
  { from: 's20', to: 's6',   name: 'Next',                       seq: 1 },  // loop → BFD step 4
  { from: 's21', to: 's23',  name: 'Notify Client (BFD RM)',     seq: 1 },
  { from: 's21', to: 's24',  name: 'Update Termsheet (ASE)',     seq: 2 },
  // s22, s23, s24 have no outgoing outcomes → terminal (End)
];

// ─────────────────────────────────────────────────────────────────────────────

async function getToken() {
  if (!CLIENT_SECRET) { console.error('[FATAL] AZURE_CLIENT_SECRET env var required.'); process.exit(1); }
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope:         `${ORG_URL}/.default`,
      }).toString(),
    }
  );
  if (!res.ok) { const t = await res.text(); throw new Error(`Auth failed: ${res.status} ${t}`); }
  const { access_token } = await res.json();
  return access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Prefer: 'return=representation',
  };
}

async function post(token, entitySet, body) {
  const res = await fetch(`${API}/${entitySet}`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`POST /${entitySet} failed: ${res.status}\n${t}`);
  }
  // Extract ID from OData-EntityId header or response body
  const location = res.headers.get('OData-EntityId') ?? res.headers.get('Location') ?? '';
  const match = location.match(/\(([^)]+)\)$/);
  if (match) return match[1];
  // Fallback: parse body
  try { const json = await res.json(); return json[Object.keys(json).find(k => k.endsWith('id'))]; }
  catch { throw new Error('Could not extract ID from POST response'); }
}

async function queryFirst(token, entitySet, filter, select) {
  const url = `${API}/${entitySet}?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' } });
  if (!res.ok) { const t = await res.text(); throw new Error(`GET /${entitySet} failed: ${res.status} ${t}`); }
  const json = await res.json();
  return json.value?.[0] ?? null;
}

async function findOrCreateRole(token, def) {
  const existing = await queryFirst(token, 'qdb_roles', `qdb_name eq '${def.name.replace(/'/g, "''")}'`, 'qdb_roleid,qdb_name');
  if (existing) {
    console.log(`  Role exists: ${def.name} (${existing.qdb_roleid})`);
    return existing.qdb_roleid;
  }
  const id = await post(token, 'qdb_roles', {
    qdb_name:        def.name,
    qdb_description: `${def.name} — seeded from Facility Renewal Long Path SOP`,
    qdb_department:  def.department,
  });
  console.log(`  Created role: ${def.name} (${id})`);
  return id;
}

async function sopAlreadyExists(token, sopName) {
  const existing = await queryFirst(token, 'qdb_sops', `qdb_name eq '${sopName.replace(/'/g, "''")}'`, 'qdb_sopid,qdb_name');
  return existing;
}

async function createSop(token) {
  const id = await post(token, 'qdb_sops', {
    qdb_name:        'Facility Renewal – Long Path',
    qdb_description: 'Full long-path process for facility renewal, covering BFD/Remedial RM, FFSAE, Sr. Manager Industrial Financing, ASE, Sr. Manager Credit Analysis, and ICC.',
    qdb_purpose:     'Standardise the end-to-end facility renewal process including credit analysis, ICC approval, and rejection handling.',
    qdb_version:     '1.0',
    qdb_status:      100000000,  // Draft
  });
  console.log(`  Created SOP (${id})`);
  return id;
}

async function createStep(token, sopId, roleDef, stepDef, roleIdMap) {
  const body = {
    qdb_name:             stepDef.name,
    qdb_description:      stepDef.desc,
    qdb_sequenceno:       stepDef.seq,
    qdb_steptypecode:     stepDef.type,
    qdb_executionchannel: stepDef.channel,
    [`qdb_sop_id@odata.bind`]: `/qdb_sops(${sopId})`,
  };
  const roleId = roleIdMap[stepDef.role];
  if (roleId) body[`qdb_role_id@odata.bind`] = `/qdb_roles(${roleId})`;
  const id = await post(token, 'qdb_sopsteps', body);
  return id;
}

async function createOutcome(token, stepIdMap, outcomeDef) {
  const fromId = stepIdMap[outcomeDef.from];
  const toId   = outcomeDef.to ? stepIdMap[outcomeDef.to] : null;
  if (!fromId) throw new Error(`No step ID for alias "${outcomeDef.from}"`);
  const body = {
    qdb_name:       outcomeDef.name,
    qdb_sequenceno: outcomeDef.seq,
    [`qdb_sopstep_id@odata.bind`]: `/qdb_sopsteps(${fromId})`,
  };
  if (toId) body[`qdb_nextsopstep_id@odata.bind`] = `/qdb_sopsteps(${toId})`;
  return post(token, 'qdb_sopoutcomes', body);
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Facility Renewal – Long Path — SOP Seed Script');
  console.log(`  Target: ${ORG_URL}`);
  console.log('══════════════════════════════════════════════════════\n');

  const token = await getToken();
  console.log('  Token acquired.\n');

  // ── Guard: skip if SOP already seeded ─────────────────────────────────────
  const existing = await sopAlreadyExists(token, 'Facility Renewal – Long Path');
  if (existing) {
    console.log(`  SOP already exists (${existing.qdb_sopid}) — nothing to do.`);
    console.log('  Delete it in CRM first if you want to re-seed.\n');
    return;
  }

  // ── 1. Create roles ────────────────────────────────────────────────────────
  console.log('Step 1 — Creating roles …');
  const roleIdMap = {};
  for (const def of ROLE_DEFS) {
    roleIdMap[def.alias] = await findOrCreateRole(token, def);
  }
  console.log();

  // ── 2. Create SOP ─────────────────────────────────────────────────────────
  console.log('Step 2 — Creating SOP record …');
  const sopId = await createSop(token);
  console.log();

  // ── 3. Create all steps (collect alias → real ID map) ─────────────────────
  console.log('Step 3 — Creating 24 steps …');
  const stepIdMap = {};
  for (const def of STEP_DEFS) {
    const id = await createStep(token, sopId, null, def, roleIdMap);
    stepIdMap[def.alias] = id;
    console.log(`  [${def.alias}] seq ${def.seq}: ${def.name.substring(0, 60)}${def.name.length > 60 ? '…' : ''} → ${id}`);
  }
  console.log();

  // ── 4. Create all outcomes (wire up the connections) ─────────────────────
  console.log('Step 4 — Creating outcomes and connections …');
  let outcomeCount = 0;
  for (const def of OUTCOME_DEFS) {
    await createOutcome(token, stepIdMap, def);
    console.log(`  ${def.from} → ${def.to ?? 'End'}: "${def.name}"`);
    outcomeCount++;
  }
  console.log();

  console.log('══════════════════════════════════════════════════════');
  console.log(`  Done. Created 1 SOP, 24 steps, ${outcomeCount} outcomes.`);
  console.log(`  SOP ID: ${sopId}`);
  console.log(`  Open designer: ${ORG_URL}/WebResources/qdb_/workflow-designer/workflow-designer.htm`);
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch((err) => { console.error('\n[ERROR]', err.message); process.exit(1); });
