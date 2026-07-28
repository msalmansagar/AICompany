# CWFD-005 — Runtime Verification

Date:   2026-07-27
Status: **PASSED 5/5.** The reconciled concurrency model executes.
Script: `scripts/runtime-verify-concurrency.js` (re-runnable, self-cleaning)

---

## 1. The finding that came first

Before running anything, the org was checked for execution history:

| Table | Records |
|---|---|
| `qdb_tasks` | **0** |
| `qdb_escalations` | **0** |
| `qdb_status_histories` | **0** |
| `qdb_applicationcommentses` | **0** |
| `qdb_escalationconigurations` | **0** |

Against 9 processes, 79 steps, 94 outcomes and 9 routes of configuration.

**The engine had never executed anything on `org5869857f`.** "Live since May" meant
registered and active, not in use. This is a design and configuration environment.

That is worth stating plainly because it explains the whole CWFD-005 engagement: DP-1 and
DP-2 shipped configuration nothing read, and nobody noticed for months **because nothing
was ever run**. Inert config is invisible when there is no execution to fail.

It also means this test was not a verification of an existing system — it was the **first
process execution this org has ever seen**, run under explicit authorisation.

---

## 2. What was tested

The two behaviours the entire reconciliation rests on:

1. **Fan-out** — `OnTaskCreate` (async, stage 40) creates one task per branch step
2. **Join guard** — `OnTaskComplete` (**synchronous**, stage 40) refuses to close a parent
   while a branch is still open

Method: create a throwaway process, a parent step, a branch step naming it via
`qdb_parentworkitemstep`, and an outcome with `qdb_checkparalleltasks`. Then create
**one** task and watch what the engine does with it.

---

## 3. Result — 5/5

```
  created ONE task (8f3e2e97-b38a-f111-ab0f-70a8a55bc6a5)
  waiting for OnTaskCreate (async) to fan out…

  PASS  fan-out: the engine created a task for the branch step — 1 branch task(s)
  PASS  fan-out: the branch task points at the branch step
  PASS  fan-out: the branch task is parented to the originating task

  attempting to complete the parent while its branch is open…

  PASS  join guard: completion refused while a branch is open
  PASS  join guard: the refusal explains why
        "Following parallel tasks are still open.\n1. ZZ_RT_BRANCH"
```

**One task in, two tasks out.** The engine read `qdb_parentworkitemstep` — the column the
reconciliation switched the designer onto — and spawned the branch. Then it refused the
parent's completion and **named the open branch in the error**, which is a better user
experience than the designer could have built on top.

This is the behaviour DP-1's original model could never have produced: `qdb_splittype` and
`qdb_jointype` would have been ignored, one task would have been created, and the process
would have run a single branch silently.

---

## 4. What this does and does not prove

**Proves:** the reconciled model is correct. The columns the designer now writes are the
columns the engine acts on, and the resulting behaviour is concurrency with a working join.

**Does not prove:** anything about production. `org5869857f` has never run a process, so
this says the configuration is internally consistent and the plugins work — not that the
behaviour is right for real business data, volume, or a populated environment.

**Not tested:** the branch condition (`qdb_applyfilter` on a branch), the forward advance
after a successful completion, and the DP-5 workflow hooks firing. The advance and the
hooks would have required completing a task, which would have exercised
`OnTaskCompletePostActivities` and executed a real workflow — deliberately out of scope for
a first execution.

---

## 5. Cleanup

Every record was deleted. Verified after the run: zero `ZZ_RT_*` rows across steps,
outcomes, processes and tasks; **`qdb_tasks` back to 0**; zero escalation instances created
as a side effect.

The org is exactly as it was.

---

## 6. Re-running it

`node scripts/runtime-verify-concurrency.js` with the usual `AZURE_*` and `DATAVERSE_URL`
environment. It creates its own configuration, regards the task to the first available
account, polls for up to 60 seconds, and cleans up in a `finally` block.

Two Dataverse details it encodes, both learned the hard way:

- Lookups on `qdb_task` bind through their **relationship** navigation properties —
  `qdb_worktask_qdb_task`, `qdb_recordtype_qdb_task`, `qdb_Decision_qdb_task` — not their
  attribute names.
- `qdb_task` is an **activity** (primary id `activityid`, primary name `subject`), so
  `regardingobjectid` binds per-target, e.g. `regardingobjectid_account_qdb_task`.
