# Questions for the QDB platform team — process engine

**From:** MSS Technologies, CRM Workflow Designer (CWFD) engagement
**About:** the process engine on `org5869857f` — `QDB.CRM.ProcessConfiguration`,
`QDBCatalog.CRM.TatAndEscalations`, `QDB.RoundRobin`
**Date:** 2026-08-13
**Verified against the org:** 2026-08-13, read-only

---

## Why you are getting this list

We have been building a visual designer over your process engine. To do that we
read the engine's source (decompiled from the registered assemblies) and probed
the org's metadata, because the designer has to write exactly the columns the
engine reads — no more, and no others.

That work surfaced eight things we cannot resolve from the code alone. Each one
is a question about **intent**, not about behaviour: we know what the code does,
we do not know what you meant it to do, and in several cases the two readings
lead to opposite actions on our side (surface a feature, or delete its schema).

**Nothing in this list is a defect report.** Several items are almost certainly
deliberate — half-built work parked for a reason, or schema kept for a migration
we cannot see. We are asking rather than assuming precisely because the cost of
assuming wrong is asymmetric: three of these questions gate an irreversible
deletion, and one gates whether a planned piece of work is possible at all.

**How to answer:** a sentence per question is enough. Where we can act on our own
once we know, we have said what we would do with each answer, so a short reply
unblocks us without a meeting.

---

## How every claim below was verified

So you can re-run any of it, and so you can tell an observation from an inference:

| Claim type | Method |
|---|---|
| A column exists | `EntityDefinitions(LogicalName='…')/Attributes` |
| A column does *not* exist | Enumerated **every** attribute on the entity — plus `LookupAttributeMetadata` for targets and `PicklistAttributeMetadata` for options — rather than searching for names we guessed |
| Code reads a column | Decompiled all three assemblies (`ilspycmd`) and searched the source |
| A workflow reads a column | Fetched **all 1,621** workflow definitions and searched `xaml` + `clientdata` |
| A plugin runs | `plugintypes` by assembly → `sdkmessageprocessingsteps` per type |
| A workflow activity runs | Searched all 1,621 workflow definitions for the activity name |
| Something has executed | Row counts on the engine's own output tables |

Two distinctions matter throughout, and we got both wrong at least once before
catching them:

- **A registered plugin step is not the same as a plugin type existing.** A
  `Plugins.*` type with no `sdkmessageprocessingstep` never executes.
- **A workflow activity legitimately has no registered step.** A `Workflows.*`
  type is invoked by a workflow definition, so for those the only evidence of
  life is a reference inside a workflow's XAML. We checked both routes before
  calling anything dead.

---

## A. Schema we would like to delete

### Q1 — What are the TAT columns for?

`qdb_work_item_steps` carries ten columns describing deadlines and escalation
timing:

`qdb_agreedtat`, `qdb_tasktat`, `qdb_tat_days`, `qdb_tat_level2_days`,
`qdb_tat_level3_days`, `qdb_tatlevel4days`, `qdb_exclude_tat`, `qdb_reminder`,
`qdb_escalationtimeformat`, `qdb_escalationlevel4`

**What we observe:** none of them is read by any of the three assemblies, and
none is referenced by any of the org's 1,621 workflow definitions. They describe
a coherent four-level TAT model that nothing implements.

The escalation mechanism that *is* wired is a different one: `qdb_escalation`
(a lookup to a reusable policy record in `qdb_escalationconiguration`) plus
`qdb_applyescalationfilter`. That is the model we have built the designer around.

**Why we are asking:** we nearly surfaced the TAT columns in the designer. Had we
done so, users would have filled in deadlines that nothing enforces — config that
looks live and is inert. We stopped, but we cannot tell which of these is true:

- legacy from a previous implementation, safe to delete;
- read by something outside these three assemblies — a console app, an
  integration, a report, an on-premise component we cannot see from here;
- intended for a mechanism that was never finished.

**What we will do with the answer:** *legacy* → we propose deleting them (Q2
applies). *Read from outside* → we surface them in the designer and document the
consumer. *Unfinished* → we leave them alone and note them as reserved.

---

### Q2 — May we delete thirteen columns that nothing references?

These were added by our own earlier phases (DP-2 / DP-2b), before we discovered
your engine already had an escalation model. They duplicate it. We have removed
all designer code that wrote them, so they are now referenced by nothing at all —
not by your assemblies, not by any of the 1,621 workflows, not by us.

On **`qdb_work_item_steps`** and again on **`qdb_sopstep`** (both confirmed
present on the org today):

`qdb_sla_enabled`, `qdb_sla_duration`, `qdb_sla_duration_unit`, `qdb_sla_basis`,
`qdb_sla_warning_pct`, `qdb_escalation_enabled`, `qdb_escalation_action`,
`qdb_escalation_target_type`, `qdb_escalationuser`, `qdb_escalationteam`,
`qdb_escalationrole`

Plus, on `qdb_work_item_steps` only, two columns from our parallel-gateway phase
that your engine also does not read — it expresses concurrency through
`qdb_parentworkitemstep` and `qdb_checkparalleltasks` instead:

`qdb_splittype`, `qdb_jointype`

Associated: four global option sets and three one-to-many relationships created
alongside them.

**Why we are asking:** deletion is irreversible, and this is your org, not ours.
Two overlapping SLA models on one entity is worse debt than either alone, so we
would like to remove ours — but we will not delete anything on your environment
without an explicit go-ahead, and we would want it done in a window you choose.

**What we will do with the answer:** *yes* → we script the removal, you review
the script, we run it with you present. *no* → we document them as reserved and
stop raising it.

---

## B. Code that exists and never runs

The three items here follow the same shape: a complete, plausible implementation
that is not connected to anything. In each case we want to know whether it is
*unfinished* or *abandoned*, because we surface the first and propose deleting
the second.

### Q3 — Is the Queue assignment branch unfinished or abandoned?

Task assignment mode **Queue (100000001)** is reachable in both resolvers —
`RoundRobin.Plugins.RoundRobin` (step scope) and
`ProcessConfiguration.Plugins.AttachProcess` (process scope). Both are registered
and both do run.

But in both, the queue branch reads `qdb_queue`, traces the queue name to the
plugin log, and **returns without setting `ownerid`**. It is the only assignment
mode in either resolver that reads its own column and then does nothing with it.

**Consequence if we surfaced it:** a designer user picks "Queue", the process
runs, and the task is created with no owner. Silently — nothing throws.

**Why we are asking:** the tracing looks like work in progress rather than an
oversight, which suggests someone intended to finish it.

**What we will do with the answer:** *unfinished, will be completed* → we build
the designer surface now so it is ready. *abandoned* → we leave Queue out of the
picker and suggest retiring the option value, so nobody selects a mode that
cannot work.

---

### Q4 — Should delegation be wired up, or removed?

`QDB.RoundRobin` contains a complete delegation model: the `qdb_user_delegate`
table, `RoundRobin.CheckDelegation` reading active delegation rows
(`qdb_user`, `qdb_delegate_to_user`, `qdb_delegate_to_team`), logic that would
redirect `ownerid` and stamp `qdb_delegatefrom` on the task.

**It cannot execute by either available route:**

- `QDB.RoundRobin.Plugins.UserDeligation` has **no registered
  `sdkmessageprocessingstep`** — we enumerated every plugin type in all three
  assemblies against `sdkmessageprocessingsteps`.
- `QDB.RoundRobin.Workflow.ApplyDelegation` is a workflow activity, so it needs a
  workflow to call it — and **none of the 1,621 workflow definitions on the org
  references it**.

`qdb_user_delegates` also holds **0 rows**.

**Why we are asking:** delegation is a feature users ask for, and the hard part
is already written. If it is meant to run, the missing piece is small — a
registration on Update/Assign of `qdb_task`. If it is not, then the table and
`qdb_delegatefrom` are in the same category as Q2's columns.

**What we will do with the answer:** *should run* → we ask you to register it,
verify it fires, then build the designer surface. *should not* → we propose
retiring the table and the column, and we stop offering delegation.

---

### Q5 — Same question for application-scope round robin

Three more types in `QDB.RoundRobin` cannot execute, and we checked each against
the test appropriate to its kind:

| Type | Kind | Evidence |
|---|---|---|
| `Plugins.ApplicationRoundRobin` | plugin | no registered `sdkmessageprocessingstep` |
| `Workflow.ApplyRoundRobin` | workflow activity | referenced by no workflow definition |
| `AssignApplication` | **we cannot tell** — its name carries neither `.Plugins.` nor `.Workflow.` | fails **both** tests: no registered step *and* no workflow reference, so it is unreachable whichever kind it is |

We flag `AssignApplication` explicitly because we could not classify it from the
type name, and applying the wrong test would have been the exact error we are
trying to avoid. If it is a workflow activity you intend to call, the answer is
that it is simply not called here yet.

Meanwhile `ProcessConfiguration.Plugins.AttachProcess` — which *is* registered,
on Create of `qdb_request` — implements its own application-scope assignment.

**Why we are asking:** this reads as two attempts at the same job where the
second won, but we would rather hear that than infer it.

**What we will do with the answer:** *superseded* → we propose removing the dead
types at the next assembly update. *not superseded* → we need to understand which
one should own application assignment before we surface either.

---

## C. Two questions that shape what we build next

### Q6 — How is a process instance actually started?

Our reading of the engine had `Workflows.ApplyProcess` as the entry point — "start
a process against a record". On checking, **nothing invokes it**: it is a workflow
activity with no registered step (correct for its kind) and no reference in any
of the 1,621 workflow definitions.

What *is* wired is a pair of plugins on **Create of `qdb_request`**:

| Plugin | Message | Stage | Mode |
|---|---|---|---|
| `Plugins.AttachProcess` | Create of `qdb_request` | 40 | sync |
| `Plugins.ApplyProcessPostActivities` | Create of `qdb_request` | 40 | async |

**Why we are asking:** these are two different contracts. If a process starts
when a `qdb_request` row is created, then `qdb_request` is the integration point
and `ApplyProcess` is superseded. If instead `ApplyProcess` is how you intend
processes to start — from a workflow that simply is not deployed on this org —
then this environment is missing that workflow, and anything we validate here is
validating an incomplete configuration.

We would rather ask than write a designer that assumes the wrong entry point.

**What we will do with the answer:** *`qdb_request` is the entry* → we correct our
engine-contract document and treat `ApplyProcess` as legacy. *`ApplyProcess` is
the entry* → we ask for the missing workflow before doing further runtime work.

---

### Q7 — Will the engine be extended to support sub-processes?

**This question gates a planned piece of work, and it is the one we most need
answered.**

We were asked to add sub-processes — a step that invokes another process and
waits for it. We investigated whether the engine already supports it, because
twice before we built something it already did.

It does not, and we checked rather than assumed. We enumerated **all 212
attributes** on `qdb_work_item_steps`:

- of the **35 lookups**, none targets a process for invocation.
  `qdb_parentworkitemstep` points at `qdb_work_item_steps` — step to step — and
  `OnTaskCreate` uses it to fan out *sibling* tasks that run alongside. That is
  concurrency, not containment. `qdb_record_type` points at
  `qdb_work_item_record_type`, which is the step's own owning process, not a
  process it invokes.
- of the **14 picklists**, none encodes a step kind. The nearest candidate,
  `qdb_taskcategory`, is a business classification of who does the work
  ("Technical Team Task", "Site Visit Engineer Task", "Follow-up").
- `OnTaskCompletePostActivities` contains no sub-process branch — its full
  advance path is the XOR route-and-next-step sequence set out in our
  `engine-contract.md` §5.

**To be clear about one thing that is ours, not yours:** our SOP designer offers a
`subprocess` step type (`qdb_steptypecode` = 100000008). That column is on
**`qdb_sopstep`**, the SOP documentation entity we provisioned ourselves — not on
`qdb_work_item_steps`, which is what your engine executes. It is a label in our
tool with nothing behind it. We mention it only so nobody sees it and concludes
sub-processes already work.

So sub-processes cannot be delivered by surfacing anything. They need new engine
code — new columns on `qdb_work_item_steps`, and logic in the task lifecycle to
start a child process and resume the parent when it finishes.

**The question is simply: are you willing to extend the engine?**

**What we will do with the answer:** *yes* → we write a specification of exactly
what we need (columns, plugin behaviour, failure semantics) and agree it with you
before either side builds. *no* → we tell our sponsor sub-processes are not
feasible without engine change, and the requirement is withdrawn or re-scoped.
*not now* → we park it and stop spending on it.

Either answer is useful. The absence of one is what costs us.

---

## D. The question behind all the others

### Q8 — Why has nothing ever executed on this org?

The engine has been registered and active since 2026-05-05. The configuration
side is substantial — 9 processes, 79 steps, 94 outcomes, 9 routes.

Every output table is empty:

| Table | Rows |
|---|---|
| `qdb_tasks` | **0** |
| `qdb_escalations` | **0** |
| `qdb_status_histories` | **0** |
| `qdb_escalationconigurations` | **0** |
| `qdb_user_delegates` | **0** |

(Re-confirmed 2026-08-13. The only exception was a controlled test we ran in July
with permission, which we cleaned up afterwards.)

**Why we are asking:** this single fact explains most of the list above. Inert
configuration is invisible — nothing fails, so nothing gets noticed. It is why
the duplicated columns in Q2 went unremarked for months, and why we cannot tell
"abandoned" from "not yet exercised" for Q3, Q4 and Q5 without asking you.

It also changes what our testing means. If `org5869857f` is a design and
configuration environment and real execution happens elsewhere, then our runtime
verification here proves less than we thought, and we should be testing where the
engine actually runs.

**What we would like to know:** is this org intended to execute processes at all,
or is it a configuration environment feeding somewhere else? If somewhere else —
can we get read access to that environment? Verifying against an org where the
engine has genuinely run would answer several of the questions above without
anyone having to write a reply.

---

## Summary

| # | Question | Blocks |
|---|---|---|
| 1 | What are the ten TAT columns for? | Surface vs delete |
| 2 | May we delete the thirteen unreferenced columns? | Irreversible cleanup |
| 3 | Queue assignment — unfinished or abandoned? | Designer picker |
| 4 | Should delegation be registered, or removed? | A requested feature |
| 5 | Same for application-scope round robin? | Dead code cleanup |
| 6 | How does a process actually start? | Correctness of our model |
| 7 | **Will the engine be extended for sub-processes?** | **A whole phase of work** |
| 8 | Why has nothing ever executed here? | What our testing is worth |

Questions 2 and 7 are the ones where we are genuinely stopped. The rest we can
work around, but each workaround is a guess we would rather not commit to code.

---

## Appendix — supporting documents

All in `projects/crm-workflow-designer/cwfd-005-runtime/`:

- `discovery-existing-engine.md` — the original metadata probe
- `engine-contract.md` — the decompiled execution contract. Two of our own earlier
  conclusions in it were wrong and are corrected in place; if you read it, read the
  correction boxes too:
  - **§5** showed `Workflows.ApplyProcess` as the entry point — Q6 above corrects this.
  - **§4 and §6** said DP-4 sub-processes could reuse `qdb_parentworkitemstep` and
    needed no engine change — Q7 above corrects this. That claim was ours, we held
    it for several weeks, and it was wrong.
- `reconciliation-dp1.md` / `reconciliation-dp2.md` — how we retired our
  duplicated columns
- `dp-3-human-task-depth.md` §6 — the dead-code findings behind Q3–Q5
- `runtime-verification.md` — the one controlled execution, July 2026
