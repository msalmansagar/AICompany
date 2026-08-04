# DP-5 — Workflow Hooks, Surfaced

Engagement: DP-5 (CWFD-007 backlog §5.B) — re-scoped by the CWFD-005 discovery
Date:       2026-07-27
Status:     **Complete — all four scopes.** Step and outcome shipped first; route and
            process followed. Both halves live-verified.

---

## 1. Why this stopped being an L

The backlog scoped DP-5 as *"External Call-API / connector step — integration beyond
Dataverse"*, effort **L**, on the assumption that nothing existed.

The engine already calls workflows. `WorkItemStepHandler.CallWorkflow` issues an
`ExecuteWorkflowRequest(WorkflowId, EntityId)` against the task record, and the task
lifecycle plugins invoke it at defined points. The columns exist on four tables and are
read by the engine in 6–7 source files.

DP-5 therefore became *surface what already runs* — **S/M**, no new schema, no
provisioning, no engine change.

---

## 2. The hooks, as they exist on the org

Verified by querying entity metadata rather than trusting the contract doc, which turned
out to under-report them:

| Table | Hooks |
|---|---|
| `qdb_work_item_steps` | on task **creation**, on task **completion**, on task **on-hold** |
| `qdb_outcome` | on task creation, on task completion |
| `qdb_outcomeworktasks` (route) | on task creation, on task completion |
| `qdb_work_item_record_type` (process) | on task creation, on task completion, on **application** creation |

Every one is a lookup to `workflow`. The engine invokes the completion hook at **three
scopes on the same transition** — outcome, step and record type — so more than one workflow
can fire for a single task. The panel says so, because it is not obvious and is the
likeliest source of surprise.

---

## 3. Scope, and what was left out

**Delivered: the step and the outcome.** These are where makers work, and where the engine
invokes most.

**Not delivered: the route and process scopes**, and the process's `onApplicationCreation`.
The shared module already models all four scopes (`ROUTE_HOOKS`, `PROCESS_HOOKS` are
defined and exported), so adding them is wiring two more panels — deliberately left as a
follow-up rather than half-wiring four surfaces in one pass.

**Only on-demand workflows are offered.** `ExecuteWorkflowRequest` is precisely what the
"run this workflow on demand" flag governs, so the picker filters to
`category eq 0 and statecode eq 1 and ondemand eq true` — 60 of the org's 108 activated
classic workflows. Offering the rest would let a maker configure something that fails at
runtime.

The picker shows each workflow's **primary table** alongside its name, because a workflow
only runs against a matching record and the designer cannot know the task table for
certain at that point.

---

## 4. Verification

tsc clean · **148 tests** · production build green.

**Live E2E 6/6** on the step and outcome scopes, and **6/6** again on route and process:

| Assertion | |
|---|---|
| step on-creation and on-completion hooks persist | PASS |
| outcome on-completion hook persists | PASS |
| process completion **and application-creation** hooks persist | PASS |
| route completion hook persists | PASS |
| an unset hook stays null | PASS |
| a hook clears through its nav prop, leaving the others intact | PASS |

No provisioning was needed — every column already existed.

---

## 5. Still open

- **Route and process scopes** — module supports them, panels do not yet.
- **No runtime test.** The hooks round-trip and the engine reads these columns, but no
  process has been run to watch a workflow actually fire. That needs a real process
  instance, and it is the same gap the concurrency half has.
- **Task-table matching is advisory.** The picker shows a workflow's primary table but does
  not enforce that it matches the process's task table, because the designer resolves that
  table from a lookup into a config table rather than from real metadata (the WZ-1b
  limitation). A mismatched pick fails at runtime, not at design time.
