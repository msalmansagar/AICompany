# DCP columns bound to QDB-wide choices — dependency and migration assessment

2026-10-04 (Asia/Qatar). Assessment, then **executed on the cloud sandbox only** (see *Migration
result* at the end). Evidence: cloud probe `crm/scripts/probe-shared-choices.mjs`; on-prem
inspections `docs/evidence/onprem/choice-inspection-HousingLoan-2026-10-04.json` and
`choice-inspection-QDB2-2026-10-04.json` (`crm/scripts/onprem-choice-inspect.js`, run by the user in
HL CRM test and QDB1 test — the QDB1 organisation reports its name as "QDB2").

## Root cause

DCP's provisioning (`crm/scripts/lib/qdb-option-set-defs.mjs`) intended **its own** choices named
`qdb_approval_status` (NotRequired, Pending, Approved, Rejected, Returned), `qdb_risk_level` and
`qdb_priority` (Low, Medium, High, Critical, DCP value range). In the sandbox those names already
belonged to QDB's unmanaged solution **GlobalOptionset** (publisher `qdb`), so provisioning skipped
them as existing and bound the DCP columns to QDB's definitions. The communication-template code was
then written against QDB's values (0 = Return, 1 = Approve).

## 1. Dependency matrix (there are six columns, not five)

| # | Table | Column | Choice | Required | Default | Rows with a value | Forms / views |
|---|---|---|---|---|---|---|---|
| 1 | qdb_collectionactivity | qdb_approvalstatus | qdb_approval_status | None | none | 0 of 15 | Information form |
| 2 | qdb_communicationtemplate | qdb_approvalstatus | qdb_approval_status | ApplicationRequired | none | **4 of 5** (all = 1) | Information form; Active / Inactive Communication Templates views |
| 3 | qdb_assignmentconfiguration | qdb_risklevel | qdb_risk_level | None | none | 0 of 0 | Information form |
| 4 | qdb_collectionstrategy | qdb_risklevel | qdb_risk_level | None | none | 0 of 2 | Information form; Active / Inactive Collection Strategies views |
| 5 | qdb_collectioncase | qdb_priority | qdb_priority | None | none | 0 of 4,363 | Information form |
| 6 | qdb_collectioncase | **qdb_risklevel** | qdb_risk_level | None | none | 0 of 4,363 | Information form |

The six columns are inside DCP's own tables (the tables are in `qdb_debtcollection` with all
subcomponents); the choices are **not** in the DCP solution — they are external dependencies.

## 2–4. Values

| Choice | Cloud sandbox | HL CRM test | QDB1 test |
|---|---|---|---|
| qdb_approval_status | 0 Return · 1 Approve | **absent** | 0 Return · 1 Approve — unmanaged; solutions WorkPackage09EntitiesOnly, WorkPackage09Minha, ExportTradeFinance (publisher `qdb`) + Default; used by `qdb_strategy_development_task`, `qdb_tasdeer_task` |
| qdb_risk_level | 751090000 Low · 751090001 Medium · 751090002 High | **absent** | identical values and labels — unmanaged; Default only; used by `qdb_loan_application_credit_risk` |
| qdb_priority | 751090000 = "████" | **751090000 High · 751090001 Medium · 751090002 Low** — unmanaged; CaseManagementChanges (publisher `qdb`) + Default; used by `incident.qdb_priority`, `qdb_case_task.qdb_priority` | 751090000 = "████" — unmanaged; Default; used by `qdb_customerfollowup`, `qdb_status_history` |

**Gate 1 decision.** No conflict with the approved design: DCP's Approval Status integers 0/1 equal
QDB1's and the cloud's; the target choice name `qdb_dcp_approval_status` is new; no DCP column is
bound to any of the three choices after the migration, so HL's absent choices stop being import
blockers. One finding strengthens the retirement: `qdb_priority` means **different things** in HL
(751090000 = High) and QDB1/cloud (751090000 = "████") — had DCP kept Case Priority on that choice,
the same stored integer would have read differently per organisation. HL also has a
`CaseManagementChanges` solution and `incident.qdb_priority`; DCP touches neither.

## 5. Ownership (cloud)

All three: unmanaged, in solution **GlobalOptionset** (publisher `qdb`, option prefix 10000) and
Default. Other columns bound to them in the sandbox:
- qdb_approval_status — `qdb_tasdeer_task.qdb_approval_status`, `qdb_strategy_development_task.qdb_approval_status`
- qdb_risk_level — `qdb_loan_application_credit_risk.qdb_risk_level`
- qdb_priority — `qdb_customerfollowup.qdb_priority`, `qdb_status_history.qdb_work_item_priority`

## 6–8. Usage

- **Approval Status — required.** Template: `communicationTemplate.ts` blocks an approval-required
  template unless `approvalStatus === 1` (`APPROVAL_STATUS_CODES = { Return: 0, Approve: 1 }`); read by
  `templateQueries.ts`; seeded by `seed-phase7-templates.mts`. Activity: documented as set by the
  Process Engine; the Legal qualification policy (`legalHandoff.ts`, empty today) compares it. 0 / 1
  semantics are kept.
- **Risk Level — not required.** Mapped into the strategy and assignment models
  (`StrategyRepository.ts`, `AssignmentService.ts`, domain `strategy.ts` / `assignment.ts`) and
  displayed (strategy list "Risk" column, V2 portfolio text), but **evaluated nowhere**: no strategy
  or assignment rule reads it, and no source supplies a customer's or case's risk level (MIS has no
  such field; Customer 360 excludes risk as unsourced). Unsupported schema.
- **Priority (case) — not required.** No code reads `qdb_collectioncase.qdb_priority`. Strategy and
  assignment "Priority" are whole-number columns (`intAttr`), unaffected.

## 9–14. Other dependencies

- **Plugins:** none reference any of the six columns (one comment in `StatusTransitionMatrix.cs`).
  No plugin step is registered on templates, strategies or assignment configuration.
- **API:** strategy / assignment Risk Level mappings only.
- **UI:** template approval (live), strategy list Risk column, V2 portfolio text.
- **Forms / views:** listed above; all regenerated by `provision-dcp-app-ux.mjs`.
- **Seed / reference data:** five P7 templates (four approved = 1, one null by design).
- **Other solutions:** the shared choices are used by Tasdeer, strategy-development, loan
  credit-risk, customer follow-up and status-history columns — none touched by this plan.

## Import risk — stated precisely

The DCP package does **not** contain these choices; its solution manifest lists them as missing
dependencies. **HL CRM import fails** because `qdb_approval_status` and `qdb_risk_level` are absent
there. QDB1 has all three, so it would import — with DCP columns bound to QDB's definitions, whose
values are not yet known. Whether *shipping* the shared choices inside the DCP package would change
QDB1's existing definitions is **not established**; the earlier statement that it would overwrite
other modules is withdrawn.

## 15. Proposed DCP-owned choice (the minimum)

| Display name | Logical name | Value | Label | Required | Default | Business purpose |
|---|---|---|---|---|---|---|
| DCP Approval Status | `qdb_dcp_approval_status` | 0 | Return | (per column) | none | Approval decision on a DCP communication template or collection activity |
| | | 1 | Approve | | | |

Naming carries the `dcp` segment because DCP's generic choice names collided with QDB's; values are
QDB's current 0 / 1, so no code or data semantics change. **No** DCP Risk Level and **no** DCP
Priority: both are unsupported (see 7–8).

### Gate 2 — exact definition (approved target design, 2026-10-04)

| Property | Value |
|---|---|
| Display Name | DCP Approval Status |
| Logical Name | `qdb_dcp_approval_status` |
| Type | Global choice (Picklist), not multi-select |
| Option 1 | Value **0** · Label **Return** |
| Option 2 | Value **1** · Label **Approve** |
| Default | none (each column keeps its own default: none) |
| Description | Approval decision on a DCP communication template or collection activity. Owned by DCP. |
| Publisher | `qdb` (customization prefix `qdb`, option prefix 10000) — DCP's existing publisher |
| Owning solution | `qdb_debtcollection` (unmanaged in the sandbox; shipped in the common on-prem package) |
| Bound columns | `qdb_collectionactivity.qdb_approvalstatus` (Required: None) · `qdb_communicationtemplate.qdb_approvalstatus` (Required: ApplicationRequired) — logical and schema names unchanged |

Values 0 and 1 are set explicitly, not taken from the publisher's 10000 range, so that stored
integers and `APPROVAL_STATUS_CODES` stay identical. Executed by
`crm/scripts/migrate-dcp-approval-status.mjs`; backup at
`docs/evidence/migrations/2026-10-04-approval-status-backup.json`.

## 16. Column migration

| Column | Action |
|---|---|
| qdb_collectionactivity.qdb_approvalstatus | Same logical name and settings, rebound to `qdb_dcp_approval_status` |
| qdb_communicationtemplate.qdb_approvalstatus | Same logical name, ApplicationRequired, rebound; values restored |
| qdb_assignmentconfiguration.qdb_risklevel | Retired (removed) |
| qdb_collectionstrategy.qdb_risklevel | Retired (removed) |
| qdb_collectioncase.qdb_risklevel | Retired (removed) |
| qdb_collectioncase.qdb_priority | Retired (removed) |

A choice column's choice cannot be changed in place, so a rebind is **delete and recreate under the
same logical name**. Requirements:

- **Attribute recreation:** yes, for the two Approval Status columns.
- **Temporary attribute:** not needed — activity has no data; the template's four values are saved to a
  file first and restored. (A temporary column is an option if preferred.)
- **Data migration:** four template rows (value 1) restored after recreation; verified by re-reading.
- **Plugin update:** none.
- **Form / view update:** forms and the four views regenerated without the column, then with it.
- **Solution component replacement:** the new choice joins `qdb_debtcollection`; the shared choices stop
  being dependencies.
- **Reference data:** none beyond the four template values.
- **Code:** template and activity code unchanged (same names, same integers). Risk Level / case Priority
  mappings, the strategy "Risk" column and the V2 portfolio text removed; provisioning definitions corrected.

## 17–18. Data and rollback

Data: four template values only, backed up before any delete. Rollback: delete the recreated column,
recreate it bound to the QDB choice, restore the backed-up values, regenerate forms and views; the
retired columns can be recreated from the previous provisioning definitions (no data to restore);
code by `git revert`.

## 19–21. Impact

- **HL CRM:** imports with no dependency on QDB-wide choices; the new DCP choice is created.
- **QDB1:** the new DCP choice is created beside QDB's; QDB's choices and their other users untouched.
- **Cloud sandbox:** six DCP columns change; QDB's choices and the five other modules' columns untouched.

## 22–23. Case workflows and complaint side effects

Analysed from `docs/evidence/onprem/case-workflows-inspection-2026-10-04.json` — see
`CaseManagement_HLComplaint_Findings.md` §6. In short: a DCP-raised HL complaint **will** trigger
QDB1's "Case : SMS Alert to Customer" (an outbound SMS to the HL customer's mobile) and the expected
closure date calculation; the Email alert stops because DCP sends no `qdb_email`. No QDB1 workflow was
changed.

## 24. Migration result — cloud sandbox org5869857f, 2026-10-04

| Item | Result | Evidence |
|---|---|---|
| `qdb_dcp_approval_status` | created, 0 Return · 1 Approve, global, unmanaged, in `qdb_debtcollection` | verification checks 1–5 |
| Both Approval Status columns | rebound; schema name `qdb_approvalstatus`, display name and required level unchanged | checks 6–7 |
| Template values | 4 before = 4 after, each 1 (Approve); 0 changed, 0 unexpected; P7-SMS-UNAPPROVED-EN still null | `2026-10-04-approval-status-restore-verification.json`, checks 26–32 |
| Activity values | 0 before = 0 after | check 33 |
| Retired | Case Risk Level, Case Priority, Strategy Risk Level, Assignment Risk Level — 404 | checks 20–23 |
| Numeric Priority | strategy and assignment `qdb_priority` Integer, ApplicationRequired — unchanged | checks 24–25 |
| QDB shared choices | values, labels and other users unchanged; none in `qdb_debtcollection`; no longer used by DCP | checks 8–19 |
| Forms / views | regenerated; no retired column referenced; Approval Status back on both forms | checks 34–40 |
| Solution dependencies | before: export required the 3 shared choices; after: `RetrieveMissingDependencies` = 0 and the export's `MissingDependencies` lists only 3 cloud-only AppSettings | check 41; `onprem-deploy/2026-10-04/source` |
| Overall | **41/41** independent checks | `docs/evidence/migrations/2026-10-04-post-migration-verification.json` |

The run stopped three times before completing — metadata read-back lag after create, a dropped
connection after publish, and the Web API model lagging the recreated column. Each stop left the
sandbox consistent and was fixed in the script (only a 404 means absent; read retries; wait for the
recreated column and the published model; resumable from a partial state), then resumed forward.

## 25. Remaining blockers

1. Common on-prem package: built (`onprem-deploy/2026-10-04/`), import pending approval; run
   `onprem-package-preflight.js` in both orgs first.
2. HL complaint end-to-end: not validated until a real cross-organisation Case creation succeeds, and
   the customer-SMS behaviour (§22) is decided.
