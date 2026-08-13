# CWFD-005 — The Execution Contract, read from the engine

Engagement: CWFD-005 / RT-1
Date:       2026-07-27
Method:     Assemblies downloaded from `org5869857f` (`pluginassembly.content`) and
            decompiled with ilspycmd 10.1.1. 98 source files recovered from
            `QDB.CRM.ProcessConfiguration` alone.
Status:     **Discovery complete. OQ-1 is answered. Two shipped engagements are
            duplicative.**

---

## 1. OQ-1 — ANSWERED

> *What does the CRM execution layer do when a step has several successors?*

**It takes exactly one, and the choice is made by the user, not the graph.**

`OnTaskCompletePostActivities.ExecuteInternal` (decompiled):

1. Fires on **task update** where `qdb_decision` is set and `statuscode == 2` (Completed).
   `qdb_decision` is a lookup **to `qdb_outcome`** — the user picks the outcome by
   completing the task with a decision.
2. Retrieves that one outcome.
3. If `outcome.qdb_applyfilter` → `GetOutcomeWorkTask()` evaluates the routes' FetchXML and
   returns **one** `qdb_outcomeworktasks`. Otherwise the outcome itself carries the target.
4. `if (carrier.qdb_nextworkitemstep != null) → CreateNextTask(...)` — **one** next task.

There is no loop over outcomes anywhere in the completion path. **The forward path is
strictly XOR**, exactly as DP-1 assumed.

**DP-1's publish block was correct and must stay** — but for a sharper reason than the one
recorded: not "the platform cannot do concurrency" (it can, see §2) but **"the platform
does concurrency through a different mechanism and will never read DP-1's fields."**

---

## 2. The engine already implements parallel execution — differently

This is the finding that matters most.

### Split — child steps, not a split type

`qdb_work_item_steps.qdb_parentworkitemstep` makes a step a **child** of another step.
In `OnTaskCreate`:

```csharp
EntityCollection parallelWorkTask = outcomeHandler.GetParallelWorkTask(stepId);
//   → all qdb_work_item_steps WHERE qdb_parentworkitemstep = stepId AND statecode = 0
foreach (Entity item in parallelWorkTask.Entities) {
    if (item.qdb_applyfilter && !CheckFilter(item.qdb_filter)) continue;  // per-branch condition
    Create_Parallel_Task(...);                                            // one task per child
}
```

So creating the parent task **fans out one task per child step**, each optionally gated by
its own FetchXML filter. That is not merely an AND-split — a per-branch condition makes it
an **inclusive (OR) gateway**, which DP-1 explicitly scoped out as a future extension.

### Join — `qdb_checkparalleltasks`

`OnTaskComplete`:

```csharp
if (outcome.qdb_checkparalleltasks)
    outcomeHandler.ValidateParallelTask(task, ...);
    //   → throws "Following parallel tasks are still open" if any sibling is open
```

**That is the AND-join**, enforced as a completion guard rather than a wait state.

### Supporting machinery

| Field / method | Role |
|---|---|
| `task.qdb_parenttask` | Links sibling parallel tasks to their originator |
| `outcome.qdb_updateparalleltaskref` | Re-parents still-open siblings onto the newly created next task |
| `OutcomeHandler.GetParallelWorkTask` | Enumerates child steps |
| `OutcomeHandler.ValidateParallelTask` | The join guard |

### The consequence

**DP-1 built a second, incompatible parallel model.** `qdb_splittype` / `qdb_jointype` are
option sets on the step that no engine code reads. The engine expresses the same intent as
a **step hierarchy** (`qdb_parentworkitemstep`) plus a **completion guard**
(`qdb_checkparalleltasks`).

DP-1 is therefore the **second** duplicated engagement, after DP-2.

---

## 3. DP-2 / DP-2b — confirmed duplicative

> **Correction (2026-07-27, during the reconciliation).** §3 as first written said the
> pre-existing four-level TAT stack was *enforcing deadlines*. That was an inference from
> the column names, and it is **not supported**. Verified since:
>
> - `qdb_agreedtat`, `qdb_tasktat`, `qdb_tat_days`, `qdb_tat_level2_days`,
>   `qdb_tat_level3_days`, `qdb_tatlevel4days`, `qdb_exclude_tat`, `qdb_reminder`,
>   `qdb_escalationtimeformat`, `qdb_escalationlevel4` are read by **none** of the three
>   assemblies and by **none of the 1,621 workflows** in the org.
> - The only step columns any engine code reads are **`qdb_escalation`** and
>   **`qdb_applyescalationfilter`**.
> - There are currently **zero** escalation configuration records, so the escalation
>   machinery is wired but dormant.
>
> The duplication finding stands — DP-2 rebuilt a mechanism that already exists — but the
> mechanism is the escalation-configuration lookup, not the TAT columns, and it is not
> currently running against anything. The TAT columns are unexplained: possibly legacy,
> possibly read by something outside these assemblies. The designer therefore does **not**
> surface them, because surfacing unread columns is the mistake being corrected.

`QDBCatalog.CRM.TatAndEscalations` reads a full escalation-configuration model:

`qdb_escalation`, `qdb_escalationconfiguration`, `qdb_conditionalescalationconfiguration`,
`qdb_escalationvalue`, `qdb_escalationvalueunit`, `qdb_escalationvaluetype`,
`qdb_escalationvalueworkflow`, `qdb_escalationrecipient`, `qdb_firstescalateon`,
`qdb_nextescalation`, `qdb_currentescalation`, `qdb_isescalated`, `qdb_level`,
`qdb_applyescalationfilter`, `qdb_parentescalationconfiguration`

It reads **none** of DP-2's fields — not `qdb_sla_enabled`, not `qdb_sla_duration`, not
`qdb_escalation_action`, not `qdb_escalation_target_type`, not the three
`qdb_escalationuser/team/role` lookups.

The existing model is also **richer** than DP-2's: multi-level escalation with a
configuration hierarchy, recipients, conditional escalation, and a workflow-valued
escalation trigger.

---

## 4. Capabilities the engine has that the designer cannot configure

Every one of these is a live runtime feature with no surface in CWFD:

| Capability | Field / type | Backlog item it pre-empts |
|---|---|---|
| Call a workflow on task **completion** | `qdb_callworkflowontaskcompletion` on outcome, step **and** record type | **DP-5** (Call-API) |
| Call a workflow on task **creation** | `qdb_callworkflowontaskcreation` | **DP-5** |
| Step hierarchy / child steps | `qdb_parentworkitemstep` | **DP-4** (sub-processes), DP-1 |
| Queue removal | `RemoveItemFromQueue` | **DP-3** (queues) |
| On-hold operations | `TaskOnHoldOperations`, `qdb_onholdupdateapplicationstatus` | **DP-3** |
| User delegation | `RoundRobin.Plugins.UserDeligation` | **DP-3** (delegation) |
| Bulk approval | `qdb_allowbulkapproval` | DP-3 |
| Comments capture | `qdb_savecomments`, `qdb_commentstype` | — |
| External/internal status | `qdb_externalstatus`, `qdb_internalstatus` | — |
| Parent-record mapping | `qdb_useparentmapping`, `UpdateParentApplicationRecord` | — |
| Cancel associated tasks | `CancelAssociateTask` | — |
| Task auto-numbering | `AutoNumberHandler` | — |

**DP-5 does not need a new Call-API mechanism.** The engine already invokes a workflow at
three scopes on both creation and completion. DP-5 becomes *surface the existing hook*,
which is an S/M, not the L it was estimated at.

> 🔴 **CORRECTION (2026-08-13) — the paragraph below is WRONG.**
> `qdb_parentworkitemstep` is a step→step lookup meaning *"run concurrently
> alongside this parent"*, which `OnTaskCreate` uses to fan out sibling tasks. It
> is **not** containment or invocation, and it does not give DP-4 sub-processes.
> Verified by enumerating all 212 attributes on `qdb_work_item_steps`: none of the
> 35 lookups targets a process for invocation and none of the 14 picklists encodes
> a step kind. DP-4 needs new engine code — that is Q7 of
> `platform-team-questions.md`. See also recommendation 6 in §6, corrected there.

~~**DP-4 does not need a new sub-process entity.** `qdb_parentworkitemstep` is a step
hierarchy the engine already walks.~~

---

## 5. The real execution contract

> 🔴 **CORRECTION (2026-08-13).** The first line below is wrong about how a
> process starts on `org5869857f`. `Workflows.ApplyProcess` is a workflow
> activity, and **nothing invokes it** — no registered step (correct for its
> kind) and no reference in any of the org's 1,621 workflow definitions. What is
> actually wired is a pair of plugins on **Create of `qdb_request`**:
> `Plugins.AttachProcess` (stage 40, sync) and `Plugins.ApplyProcessPostActivities`
> (stage 40, async). Whether `qdb_request` is the intended entry point or this org
> is simply missing the workflow that would call `ApplyProcess` is Q6 of
> `platform-team-questions.md`. The rest of the contract below is unaffected —
> it was verified from the decompiled source and re-confirmed on the org.

```
ApplyProcess (workflow activity)
   └─ starts a process against a record   ← see correction above: invoked by nothing

OnTaskCreate (plugin)
   ├─ CallWorkflow(qdb_callworkflowontaskcreation)
   ├─ CreateRelatedDocuments
   └─ for each child step (qdb_parentworkitemstep), filter permitting
        └─ Create_Parallel_Task  ← the SPLIT

OnTaskComplete (plugin, pre)
   └─ if outcome.qdb_checkparalleltasks
        └─ ValidateParallelTask → block while siblings open  ← the JOIN

OnTaskCompletePostActivities (plugin, post/async)
   ├─ resolve outcome from task.qdb_decision            ← the user's choice
   ├─ if outcome.qdb_applyfilter → pick ONE route by FetchXML
   ├─ AddComments / UpdateParentApplicationRecord
   ├─ CallWorkflow × 3 scopes (outcome, step, record type)
   ├─ if carrier.qdb_nextworkitemstep → CreateNextTask   ← the XOR advance
   ├─ if outcome.qdb_updateparalleltaskref → re-parent open siblings
   └─ RemoveItemFromQueue

TatAndEscalations (separate assembly)
   └─ escalation configuration hierarchy, levels, recipients, first/next escalate-on
```

---

## 6. Recommendations

1. **Do not build a CWFD-005 runtime.** It exists. Re-scope CWFD-005 to *surfacing* the
   contract above in the designer.
2. **Re-scope DP-1.** The shipped fields are inert. The correct implementation is to model
   `qdb_parentworkitemstep` (child steps) and `qdb_checkparalleltasks` (join guard). Decide
   whether to migrate DP-1's UI onto those fields and retire `qdb_splittype`/`qdb_jointype`,
   or leave both and accept the debt. **Recommend migrate and retire** — two parallel models
   on one entity is worse than none.
3. **Re-scope DP-2/DP-2b** the same way: surface the TAT/escalation-configuration model,
   retire the `qdb_sla_*` fields.
4. **Keep GL-05 and the publish block** until DP-1 is re-based onto the engine's model.
5. **DP-5 drops from L to S/M** — surface `qdb_callworkflowontask{creation,completion}`.
6. ~~**DP-4 re-scopes** around `qdb_parentworkitemstep` rather than a new entity.~~
   🔴 **WRONG — corrected 2026-08-13, see the correction in §4.** `qdb_parentworkitemstep`
   means "run alongside", not "contain". DP-4 cannot be delivered by surfacing anything and
   needs the engine extended; that is Q7 of `platform-team-questions.md`.
7. **Adopt the org-capability probe** in the BA phase. Two engagements shipped duplicate
   functionality because nothing in the pipeline asked what the org already does.

The engine source is recoverable at will from `pluginassembly.content` and should be
treated as reference documentation for every future CWFD engagement.
