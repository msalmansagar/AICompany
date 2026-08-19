# DP-3 — Human-task depth, read from the engine

Engagement: CWFD-007 / DP-3
Date:       2026-08-09
Method:     The three engine assemblies downloaded from `org5869857f`
            (`pluginassembly.content`) and decompiled with ilspycmd 10.1.1, then
            every finding checked against the org's own metadata and registrations.
Status:     **Delivered. Three capabilities surfaced, two defects fixed, four
            engine features deliberately NOT surfaced.**

---

## 1. Why this was a discovery job and not a build job

The backlog lists DP-3 as *"Human-task depth: delegation, reassign, priority,
queues — M"*. Four of those words describe things the engine does not do.

The lesson from DP-2 is that a column existing is not evidence that anything
reads it. This engagement added a second test, because DP-3 found something DP-2
did not have to face: **a plugin type existing is not evidence that it runs.**
A type with no registered `sdkmessageprocessingstep` never executes, whatever its
code says.

So each candidate had to pass three gates:

1. Does engine code read the column?
2. Is the code that reads it registered and active?
3. Does the branch that reads it actually *do* something?

Delegation passes (1) and fails (2). Queue assignment passes (1) and (2) and
fails (3).

---

## 2. What the engine does — the assignment resolver

`QDB.RoundRobin.Plugins.RoundRobin` is registered **sync, stage 10, on Create of
`qdb_task`** and is the only thing that sets a new task's owner:

```csharp
if (step.qdb_enableroundrobin) mode = 100000004;          // the flag wins
else                           mode = step.qdb_task_assign_to;

switch (mode) {
  case 100000000: target["ownerid"] = step.qdb_assigned_user;      break;
  case 100000001: trace("Assign to Specific Queue.." + queue.Name); break;  // <-- no assignment
  case 100000002: target["ownerid"] = step.qdb_team;               break;
  case 100000003: /* read a user field off the parent record */    break;
  case 100000004: /* round robin over qdb_roundrobinteam */        break;
}
```

The identical five-way switch runs at process scope in
`Plugins.AttachProcess` (sync, stage 40, Create of `qdb_request`), against
`qdb_work_item_record_type.qdb_assign_to` — a **different column name** for the
same option set.

`qdb_task_assign_to` on the org carries six values:

| Value | Label | Engine behaviour |
|---|---|---|
| 100000000 | Specific User | assigns |
| 100000001 | Queue | **traces only — never assigns** |
| 100000002 | Team | assigns |
| 100000003 | Read From Parent | assigns |
| 100000004 | Apply Round Robin | assigns |
| 100000005 | NA | no branch; falls through to *"Task Assignment is not proper defined"* |

---

## 3. Defect found: round robin was written as Team

The designer encoded Apply Round Robin as **the Team value (100000002) plus
`qdb_enableroundrobin = true`**, with a comment asserting the two share an option
value. The org says otherwise — 100000004 Apply Round Robin has always existed.

The mis-encoding ran correctly, because the engine checks the flag first. The
**read-back** did not:

```ts
if (code === ASSIGN_TO_CODES.team)       return 'team';        // 100000002
if (code === ASSIGN_TO_CODES.roundRobin) return 'roundRobin';  // also 100000002 — unreachable
```

Neither adapter selected `qdb_enableroundrobin`, so it could not discriminate at
all. The failure sequence:

1. Save a round-robin step → org gets 100000002 + flag true. Runtime correct.
2. Reopen the process → the step reads back as **Team, with no team chosen**.
3. Change anything else and save → `qdb_enableroundrobin` is rewritten from the
   now-wrong mode as **false**.
4. Next task → flag false, mode 100000002, `qdb_team` null → the Team branch's
   guard fails → *"Task Assignment is not proper defined"* → **task created with
   no owner**.

**Four steps on `org5869857f` carry the flag today**, every one of them one save
away from step 3. A fifth, `Test Step for RM`, already sits on 100000002 with a
round-robin team and the flag cleared — the state step 3 produces.

Fixed by writing 100000004 and reading the flag, so rows saved under the old
encoding still resolve to round robin.

---

## 4. Defect found: the on-hold hook offered the wrong kind of process

DP-5 gave all four workflow hooks one picker — activated, on-demand, category-0
workflows — because the engine runs them via `ExecuteWorkflowRequest`. Three of
them do. `qdb_callworkflowontaskonhold` does not:

```csharp
Entity wf = service.Retrieve("workflow", actionRef.Id, new ColumnSet("uniquename"));
string message = "qdb_" + wf.GetAttributeValue<string>("uniquename");
service.Execute(new OrganizationRequest(message) { ["Target"] = taskRef,
                                                   ["ActionHistory"] = workItemHistory });
```

That is a **CRM Action** (category 3), invoked by message name.

**All 108 activated category-0 workflows on this org return `uniquename` null.**
So every option the picker offered for this hook resolved to the message name
`"qdb_"` — unregistered — and would have thrown on the first task put on hold.

Verified live after the fix: the hook now offers exactly one option,
`[PC] Get Task Context` → `qdb_PCGetTaskContext`, which is present in
`sdkmessages`. There are two `workflow` rows for it, so options are deduped by
message.

The on-hold *reason* carries a second, genuine workflow
(`qdb_onholdreason.qdb_trigerworkflow`, run through `ExecuteWorkflowRequest`).
That is a separate config table with zero records; not surfaced.

---

## 5. Delivered

| Capability | Column(s) | Read by | Registered? |
|---|---|---|---|
| Round robin, correctly encoded | `qdb_task_assign_to` = 100000004 | `Plugins.RoundRobin` | sync, stage 10, Create of `qdb_task` — **active** |
| Read From Parent | `qdb_assignto_parententity`, `qdb_assignto_parentfield`, `qdb_assignto_user_mapping` | `Plugins.RoundRobin`, `Plugins.AttachProcess` | **active** |
| Allow bulk approval | `qdb_allowbulkapproval` (+ task's `qdb_bulkapprovalids`) | `Plugins.OnTaskComplete` → `CommanHandler.ProcessBulkApprovalRecords` | sync, stage 40, Update of `qdb_task` — **active** |
| On-hold hook, correctly typed | `qdb_callworkflowontaskonhold` | `Workflows.TaskOnHoldOperations` | workflow activity |

All three assignment lookups are required together: the resolver's branch tests
every one of them, so validation refuses a partial setup rather than shipping a
step that assigns nobody.

---

## 6. NOT surfaced — and why

**This section is the point of the document.** Each of these has a column, and
three of them have code. None of them would do anything.

### Delegation — `QDB.RoundRobin.Plugins.UserDeligation` has NO REGISTERED STEP

`RoundRobin.CheckDelegation` reads a real model: `qdb_user_delegate` rows
(`qdb_user`, `qdb_delegate_to_user`, `qdb_delegate_to_team`, active only), and
would redirect `ownerid` and stamp `qdb_delegatefrom`.

It never runs. Enumerating every plugin type in the three assemblies against
`sdkmessageprocessingsteps`:

```
PLUGIN   QDB.RoundRobin.Plugins.UserDeligation          ->  *** NO REGISTERED STEP ***
PLUGIN   QDB.RoundRobin.Plugins.ApplicationRoundRobin   ->  *** NO REGISTERED STEP ***
```

`qdb_user_delegates` also holds **0 records**. The prior session's note listed
delegation among the DP-3 items that "all live in the engine". That was wrong,
and surfacing it would have repeated the DP-2 mistake precisely.

### Queue assignment (100000001) — a branch that only traces

Both resolvers reach the queue branch, read `qdb_queue`, log its name, and
**return without touching `ownerid`**. Offering "Queue" in the designer would
produce a task nobody owns. `Workflows.RemoveItemFromQueue` removes a queue item
but is a workflow activity with no configuration surface and no counterpart that
adds one.

### NA (100000005) — no branch at all

Falls through to *"Task Assignment is not proper defined"*.

### `qdb_onholdreason.qdb_trigerworkflow` — zero records

Real and invoked, but the table is empty and the on-hold hook already covers the
step-level case. Data gap, not a designer gap.

---

## 7. Open questions for the platform team

Added to the list this project already owes them:

1. **Is the Queue branch unfinished or abandoned?** It is the only mode in either
   resolver that reads its column and then does nothing with it.
2. **Should `UserDeligation` be registered?** A complete delegation model,
   including a table, exists and has never been wired to a message. If it is
   meant to run, it belongs on Update/Assign of `qdb_task`; if not, the
   `qdb_user_delegate` table and `qdb_delegatefrom` should go the way of the
   `qdb_sla_*` columns.
3. **Same for `ApplicationRoundRobin`** — round robin at application scope is
   written and unregistered, while `AttachProcess` implements its own.

---

## 8. Note for whoever picks up CWFD-006 — ✅ DONE

~~`src/panels/` — `PropertiesPanel`, `StepPanel`, `OutcomePanel`, `ProcessPanel`,
`RoutePanel` and `shared/` — is **unreferenced**, superseded by
`src/components/edit/*PropertiesPanel.tsx`.~~

**Resolved in PR #68** (design-system adoption): `src/panels/` was deleted after
checking both the import graph and the JSX. Nothing to pick up.
