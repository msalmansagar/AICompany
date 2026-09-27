/**
 * tracker-phase8-start.cjs
 * Writes the Phase 8 start row into the delivery tracker, and nothing else.
 *
 * Kept as a script rather than typed into a shell because the notes are long and contain the
 * punctuation that breaks shell quoting. Re-running it overwrites the Phase 8 row idempotently.
 */

const XLSX = require('xlsx');
const path = require('path');

const FILE = path.resolve(__dirname, '../../DebtCollection_Project_Tracker.xlsx');

const NOTES = [
  'PHASE 8 authorised 2026-09-21 from the accepted Phase 7 baseline 7c92463d. Branch feat/dcp-phase8-strategy-automation.',

  'ESTIMATE 36.50 AI-assisted effective execution hours, SUMMED from 16 packages (not judged). Expected completion = start + 36.50 EFFECTIVE hours, deliberately not a wall-clock date.',

  'WP1 DISCOVERY COMPLETE - read-only probe of org5869857f, re-runnable at crm/scripts/probe-phase8-discovery.mts; write-up docs/Phase8_Discovery.md. Nothing created, updated or deleted.',

  'KI-71 CONFIRMED BY METADATA: qdb_collectionactivity has ZERO lookups to qdb_strategyaction and NO alternate keys. Configuration available to automate against: 2 strategies, 4 strategy actions, 12 activity types, 30 outcomes.',

  'KI-71 DESIGN (WP2): two optional additive columns on qdb_collectionactivity - qdb_strategyactionid (lookup to qdb_strategyaction) for provenance, and qdb_origin (choice Manual / Strategy generated) so origin is STATED not inferred. Idempotency is NOT a column: strategy-generated work takes activityId = uuidv5(caseId | episodeNumber | strategyActionId | evaluationContext) with If-None-Match:* per ADR-DCP-20. Backfill leaves both null - asserting historic activities were Manual would invent history. Cloud and On-Prem identical. No QDB business semantics changed, so provisioned under authorisation section 3 rather than escalated.',

  'LEGAL - qdb_qdblegal (Litigation Request) EXISTS: 158 attributes, OrganizationOwned (no ownerid), audit on, NO alternate keys. Business-required on create: qdb_casetype, qdb_caseagainst, qdb_caseinitiatedby, qdb_summaryjustification. BUT all 32 registered plugin steps are MICROSOFT platform internals (ObjectModel Implementation, Archive/Retain) - ZERO QDB custom plugins - and ZERO workflows/BPF/actions have it as primary entity. The preferred option B (call an existing supported business entry point) DOES NOT EXIST on this org. Also its customer lookups qdb_customer and qdb_cif target ACCOUNT ONLY, while Housing Loan customers are CONTACTS, so an HL-originated Litigation Request has no column for its customer. DECISION REQUIRED (authorisation section 34).',

  'RESTRUCTURING - swept all 3,144 entities and all 1,622 workflows. Four candidates, ALL 0 rows: qdb_customer_restructure_history, qdb_macapplicationrescheduling, qdb_nrgpwriteoff (WCF), qdb_tawarruqaccountrescheduling. ZERO matching workflows. Multiple plausible implementations, none authoritative. DECISION REQUIRED (authorisation section 17). Fallback if none: stop at Strategy -> Restructuring Recommendation -> Assignment -> TAT/Escalation and record the full process as Phase 9.',

  'ASSIGNMENT - QDB.RoundRobin v1.0.0.0: Plugins.RoundRobin is ACTIVE on Create of qdb_task (stage 10, sync) and is the ONLY live assignment path; it assigns PROCESS ENGINE TASKS, configured per work item step via qdb_roundrobinmasterdata (2 rows, keyed by qdb_workitemstep). Plugins.UserDeligation and Plugins.ApplicationRoundRobin have NO registered step and never execute. Workflow.ApplyRoundRobin, Workflow.ApplyDelegation and QDB.RoundRobin.AssignApplication are referenced by 0 of 1,523 ACTIVATED workflows (xaml read, nextLink followed - $top suppresses it). No general Smart Assignment service exists for qdb_collectioncase or qdb_collectionactivity. NOT a stop condition: authorisation section 8 already directs isolating an adapter and recording the dependency. KI-09 stands.',

  'ESCALATION / TAT - qdb_escalationconiguration 0 rows, qdb_escalations 0 rows, Workflows.CreateEscalationRecord referenced by 0 of 1,523 activated workflows. The stack is WIRED AND DORMANT: nothing live to reuse, nothing live to disturb. DCP already holds the configuration escalation needs - qdb_strategyaction.qdb_escalateifnotcompleted / qdb_escalationhours / qdb_dayoffset and qdb_collectionactivitytype.qdb_slahours - so NO TAT threshold is invented or hard-coded.',

  'PROCESS ENGINE - config-rich, execution-zero: qdb_work_item_steps 119 rows, qdb_outcome 166 rows, qdb_request 0, qdb_task 0. Workflows.ApplyProcess referenced by 0 of 1,523 activated workflows. org5869857f is a DESIGN/CONFIG environment. Phase 8 therefore keeps collection work in qdb_collectionactivity (proven end to end in Phases 6-7) and treats the Process Engine as a DOWNSTREAM DESTINATION, not a dependency - routing DCP work through it would mean commissioning the first-ever process execution on this org.',

  'THREE GATES applied throughout before calling anything live: does code read it; is that code registered and active; does the branch do something. And the KIND decides the test - a Plugins.* type is dead without a registered step, while a Workflows.* type is a custom workflow ACTIVITY where no step is normal and life is a reference inside a workflow definition.',

  'OPEN KI CLASSIFICATION: KI-71 blocker (resolved WP2); KI-09, KI-66, KI-76, KI-96 dependencies; KI-53 non-blocking for build and blocking for a production run; KI-65, KI-72, KI-79, KI-83, KI-95, KI-97 non-blocking. NONE closed by discovery.',

  'WORK PACKAGES (hours): WP1 discovery 2.00 COMPLETE; WP2 KI-71 provenance 2.00; WP3 strategy domain model 2.50; WP4 execution + idempotency 3.00; WP5 re-evaluation 3.00; WP6 assignment adapter 2.50; WP7 TAT/escalation 3.00; WP8 Action Plan upgrade 1.50; WP9 Legal hand-off 2.50 HELD; WP10 Legal visibility 2.00 HELD; WP11 Restructuring 1.00 HELD; WP12 operational queues/UI 3.00; WP13 real Dataverse validation 2.00; WP14 Chrome QA journeys 3.00; WP15 regression/hardening 2.00; WP16 docs/ADRs/closure 1.50.',

  'DEPENDENCIES: WP2 <- WP1; WP3 <- WP2; WP4 <- WP3; WP5 <- WP4; WP6 <- WP3; WP7 <- WP4; WP8 <- WP2,WP4; WP9/WP10 <- Legal decision; WP11 <- Restructuring decision; WP12 <- WP6,WP7,WP8; WP13/WP15/WP16 <- all; WP14 <- WP12.',

  'RISKS: Legal/Restructuring decisions arriving late (WP9-11 isolated, nothing else depends on them); Process Engine later named as the destination for collection work (kept downstream, no DCP work modelled as qdb_task); qdb_origin duplicating a distinction QDB models differently (2 values, optional, cheap to retire); re-evaluation destroying history (explicitly forbidden - completed and manual work is never deleted); assignment adapter becoming a de-facto engine (refuses rather than routes where no capability is configured).',

  'RUNTIME GATES PLANNED: strategy evaluation; strategy-generated activity; manual remains distinguishable; duplicate evaluation; re-evaluation after bucket change; assignment; reassignment; TAT; escalation; retry/concurrency; Legal recommendation and hand-off (held); duplicate Legal prevention (held); Legal status visible in the workspace; restructuring (held); large queue paging; rapid filter/search changes; officer-facing error handling; Phase 5/6/7 regression.',

  'CALIBRATION CARRIED FORWARD: Phase 7 WP12 was estimated 2.00h and took ~11h27m because the package covered a screen while the work also absorbed a population resolver, deployment, browser QA, cleanup tooling, documentation and an undiscovered platform defect (KI-96). WP12-WP15 here carry the same shape; the deploy -> live validation -> browser QA loop is charged to WP13/WP14 as their own packages. Any revision will record the original figure, the revised figure, the reason and a timestamp - never silently.',
].join(' ||| ');

const workbook = XLSX.readFile(FILE);
const phases = XLSX.utils.sheet_to_json(workbook.Sheets['Phases'], { header: 1 });

const row = phases.findIndex(entry => entry[0] === 'Phase 8');
if (row < 0) throw new Error('Phase 8 row not found in the Phases sheet');

phases[row][1] = 'Strategy automation, assignment & escalation';
phases[row][2] = 'In Progress - WP1 discovery COMPLETE; 2 decisions outstanding (Legal, Restructuring); unblocked packages proceeding';
phases[row][3] = '2026-09-21 09:14:10 (+03:00 Asia/Qatar)';
phases[row][4] = '';
phases[row][5] = NOTES;

workbook.Sheets['Phases'] = XLSX.utils.aoa_to_sheet(phases);
XLSX.writeFile(workbook, FILE);

const check = XLSX.utils.sheet_to_json(XLSX.readFile(FILE).Sheets['Phases'], { header: 1 })
  .find(entry => entry[0] === 'Phase 8');
console.log('Phase 8 status :', check[2]);
console.log('Phase 8 start  :', check[3]);
console.log('notes          :', String(check[5]).length, 'chars');
console.log('sheets present :', XLSX.readFile(FILE).SheetNames.length);
