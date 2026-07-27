# CWFD-005 — Discovery: the runtime already exists

Engagement: CWFD-005 / RT-1 — Runtime Engine Integration
Date:       2026-07-27
Method:     Read-only metadata queries against `org5869857f` (plugin steps,
            workflow definitions, plugin types, entity attributes)
Status:     **Pre-BA research. This overturns a planning assumption held since DP-2.**

---

## 1. The assumption we have been working under

Every CWFD engagement since CWFD-007 has been scoped against this statement, from the
backlog brief's §2 "Scope boundary (read first)":

> CWFD is a design-time modeller. It writes process configuration into Dataverse entities;
> the actual execution happens in a separate CRM layer (plugins / flows). The process
> engine, by current architecture, **has no runtime**.

That statement is half right and half wrong, and the wrong half is expensive:

- ✅ "execution happens in a separate CRM layer" — **true**
- ❌ "the process engine has no runtime" — **false. It has one, it is registered, and it
  is active.**

DP-2 shipped SLA config described as "inert until the CWFD-005 runtime exists". DP-1
shipped a publish block premised on not knowing what the execution layer does. Both were
built around a runtime believed not to exist. It exists.

---

## 2. What is actually on the org

### 2.1 Plugin assemblies

| Assembly | Version | Registered |
|---|---|---|
| `QDB.CRM.ProcessConfiguration` | 1.0.0.0 | 2026-05-05 |
| `QDBCatalog.CRM.TatAndEscalations` | 1.0.0.0 | 2026-05-05 |
| `QDB.RoundRobin` | 1.0.0.0 | 2026-05-05 |

### 2.2 Plugin types — this is the engine

| Type | What it evidently does |
|---|---|
| `QDB.CRM.ProcessConfiguration.Workflows.ApplyProcess` | **Starts a process instance against a record.** The entry point |
| `QDB.CRM.ProcessConfiguration.Plugins.OnTaskCompletePostActivities` | **Advances the process when a task completes.** The step-transition engine |
| `QDB.CRM.ProcessConfiguration.Workflows.GetDateDifference` | Date arithmetic — TAT/deadline support |
| `QDBCatalog.CRM.TatAndEscalations.Workflows.CreateEscalationRecord` | **Raises escalation records** |
| `QDB.RoundRobin.Workflow.ApplyRoundRobin` | Round-robin assignment at runtime |
| `QDB.RoundRobin.Plugins.UserDeligation` | **User delegation** |
| `QDB.RoundRobin.Plugins.MapWorkTaskFields` | Work-task field mapping |
| `QDB.CRM.ProcessConfiguration.Plugins.MapRelatedAttributes` | Attribute mapping on create (all 4 tables) |
| `QDB.CRM.ProcessConfiguration.Plugins.ValidateAdvanceFindFilter` | Server-side FetchXML validation |
| `QDB.CRM.ProcessConfiguration.Plugins.ValidateOutcomeWorkTask` | Server-side route validation |

### 2.3 Activated workflows and actions

| Name | Entity | Type |
|---|---|---|
| `[PC][Work Item Step] - Create Task` | `qdb_work_item_steps` | **Action, ACTIVATED** — creates the CRM task for a step |
| `Create Of Work Item Steps` | `qdb_work_item_steps` | Classic workflow, ACTIVATED |
| `[PC][Outcome Work Task] - Map Attributes` | `qdb_outcomeworktasks` | Classic workflow, ACTIVATED |
| `[PC]- Clone Process` | `qdb_work_item_record_type` | Classic workflow, ACTIVATED |

Plus an async post-operation plugin step named **`WorkflowExpansion`** (stage 45, mode 1)
on `qdb_work_item_steps`.

`[PC]` = Process Configuration. All registered 2026-05-05 — this predates every CWFD
engagement in this repo.

---

## 3. The expensive consequence: DP-2 duplicated a live capability

`qdb_work_item_steps` carries **181 custom columns**. Among them, a complete TAT
(Turn Around Time) and multi-level escalation stack that **already existed before DP-2**:

| Pre-existing | Purpose |
|---|---|
| `qdb_agreedtat`, `qdb_tasktat` | Agreed / task turnaround time |
| `qdb_tat_days`, `qdb_tat_level2_days`, `qdb_tat_level3_days`, `qdb_tatlevel4days` | **Four-level** TAT thresholds |
| `qdb_exclude_tat` | Exclude this step from TAT |
| `qdb_escalation` (lookup), `qdb_escalationname` | Escalation configuration record |
| `qdb_escalationlevel4`, `qdb_escalationtimeformat` | Escalation level and time unit |
| `qdb_applyescalationfilter` | Conditional escalation |
| `qdb_reminder` | Reminder threshold |

And what DP-2 / DP-2b added alongside it:

| DP-2 addition | Overlaps |
|---|---|
| `qdb_sla_enabled`, `qdb_sla_duration`, `qdb_sla_duration_unit` | `qdb_agreedtat` / `qdb_tat_days` / `qdb_escalationtimeformat` |
| `qdb_sla_warning_pct` | `qdb_reminder` |
| `qdb_sla_basis` | — (genuinely new) |
| `qdb_escalation_enabled`, `qdb_escalation_action`, `qdb_escalation_target_type` | `qdb_escalation`, `qdb_applyescalationfilter` |
| `qdb_escalationuser`, `qdb_escalationteam`, `qdb_escalationrole` | partially `qdb_escalation` → escalation record |

**The org now has two SLA/escalation configuration surfaces on the same entity.** One is
enforced by `QDBCatalog.CRM.TatAndEscalations` and has been live since May. The other is
DP-2's, which nothing reads.

This is not a defect in DP-2's execution — the build, tests, review, QA and audit were all
sound. It is a **discovery failure at the BA/architecture stage**: nobody queried the org
for existing capability before designing a new one. The `github-researcher` gate asks
"does an open-source library already do this?" No gate asked "does this org already do
this?"

---

## 4. What this means for the three requested engagements

### CWFD-005 / RT-1 — scope collapses, value stays

Not a greenfield runtime. `ApplyProcess` starts instances, `OnTaskCompletePostActivities`
advances them, `Create Task` materialises the work, `TatAndEscalations` enforces deadlines.

The real work is much smaller and much more useful:

1. **Read the existing engine** — decompile/inspect `ApplyProcess` and
   `OnTaskCompletePostActivities` to establish exactly how outcomes are evaluated and
   which one is taken. *This finally answers OQ-1 properly.*
2. **Reconcile the two SLA surfaces** — almost certainly retire DP-2's fields and surface
   the **existing** TAT/escalation columns in the designer instead. That converts DP-2's
   inert config into working behaviour by deleting code, not adding it.
3. **Surface what the engine already supports** but the designer cannot configure —
   delegation, reminders, TAT exclusion, 4-level escalation, bulk approval, on-hold status.

### DP-1 — the publish block is vindicated

`OnTaskCompletePostActivities` advancing on a single completed task is exactly the
single-branch-execution risk the block was built to contain. **Do not lift GL-05 until the
engine's outcome evaluation has been read.**

### DP-3 (human-task depth) — partly already built

`UserDeligation` and `ApplyRoundRobin` exist at runtime. Delegation may need designer
surface only, not a runtime.

### DP-5 (Call-API) and DP-4 (sub-processes)

Both must extend *this* engine, not a hypothetical one. Neither should be designed before
step 1 above is done — otherwise they repeat the DP-2 mistake at larger scale.

---

## 5. Recommendation

**Do not start building any of the three engagements yet.** Insert a short discovery phase:
read the two engine plugins, document the real execution contract, then re-scope
CWFD-005 / DP-5 / DP-4 against it.

The single highest-value deliverable in the whole CWFD program right now is not a feature.
It is the answer to "what does `OnTaskCompletePostActivities` actually do", because it
unblocks GL-05, resolves the DP-2 duplication, and determines the shape of every
remaining engagement.

---

## 6. Process change proposed

Add an **existing-capability probe** to the BA phase for any engagement touching a live
org: query registered plugin steps, activated workflows, and the target entity's existing
columns *before* designing new schema. The `github-researcher` adopt-over-build gate has an
org-shaped blind spot, and this is what fell through it.
