# ADR-011 — Scheduled runs: one trigger at a time, paged, with failures counted outside the call

**Project:** CSE-ENG-001 — Customer Survey Engine
**Status:** Proposed (awaiting CEO architecture approval)
**Date:** 2026-11-21
**Requirements:** FR-CSE-098, NFR-CSE-006 (amended), NFR-CSE-019/020, BR-E1..E3 (BRD Addendum E, v1.6); spec
`specs/001-scale-per-org` FR-001..011 (clarified 2026-11-21)
**Amends:** ADR-010 (run model), ADR-005 (daily scheduler)

## Context

HL CRM has ~10,000 active customers; the BRD assumed ~450. The scheduled pass builds every due trigger's whole
population in one Custom API call (one transaction, 2-minute sandbox limit). At ~165 ms per customer a
10,000-customer quarterly survey needs ~28 minutes, so the call is cut and rolled back every time and the survey
is never sent. The one-time send already solved the same problem with paging and a saved cursor (ADR-010,
DEF-CSE-002). The CEO clarified that same-day scheduled surveys run one at a time in priority order, that
progress is shown on the trigger form, and that a step failing repeatedly marks the trigger Stuck.

## Decision

1. **One trigger at a time, priority order.** Due triggers are ordered by priority (then trigger id). The pass
   works on the first whose run for its period is incomplete and moves on only when it completes.
2. **Paged, resumable.** Each trigger's population is read 25 customers at a time (the one-time page size and
   readers). After each page the position, counts and progress time are written to the trigger with a
   row-version conditional update; the call stops between pages when the budget is spent and the next call
   resumes. A run belongs to one period (`qdb_run_period_key`).
3. **No duplicates, cheaply.** Each page checks the period's dedupe keys for its own 25 customers; the
   invitation alternate key stays the backstop. A failed call loses only its own pages, which the next call
   redoes.
4. **Run record reused.** The one-time run columns on the trigger are reused; added: period key, evaluated
   count, failed-call count, progress time, and run status **Stuck**. Shown read-only on the trigger form.
5. **Failures counted outside the failed call.** A failed call rolls back anything it writes, so the scheduler
   script, after a failed `Pass = Daily` call, calls `Pass = RecordFailure` in a new transaction. It increments
   the in-progress trigger's failed-call count and, at Survey Settings `qdb_stuck_after_failed_calls`
   (default 3), sets Stuck with the reason. A successful page resets the count. A Stuck trigger is skipped so
   lower-priority triggers proceed, and is retried on the first Daily call of each new day.
6. **Other daily passes unchanged.** Postponed release and retention already check the budget per item and
   resume naturally.

## Consequences

- Every call stays inside the 2-minute limit whatever the customer count or server speed; a 10,000-customer
  survey completes in ~28 minutes of work across the 15-minute scheduler's calls (NFR-CSE-019).
- When two scheduled surveys fall due for one customer the same day, the higher-priority one is sent first and
  the other meets the fatigue rule: unchanged result for Postpone triggers; a Drop trigger is logged as
  **Fatigue** instead of **PriorityLost**.
- Foreseeable per-customer problems are logged and skipped as today; a platform fault on one customer stops the
  call, and after three such calls the trigger is Stuck and monitoring is alerted (scheduler exit 1 on each
  failure).
- Schema: four trigger columns, one run-status option, one settings column, one form section (cloud: user's
  go-ahead; on-prem: kit 1.2.0.5). `qdb_srv_RunDueSurveys` accepts one more `Pass` value; no new API.

## Alternatives considered

- **Larger budget**: impossible; the sandbox limit is fixed (Constitution Article X).
- **Interleave triggers per customer page** (keeps PriorityLost): the populations differ ("all active" vs
  "active in a source"), so they cannot be paged together; contradicts the CEO's clarification.
- **One asynchronous job per trigger**: same 2-minute limit, plus a second scheduling mechanism.
- **Failure counter inside the call**: rolled back with the failure.
- **Separate Custom API to record failures**: same effect as a `Pass` value with more schema.
- **A "Scheduled runs" table** (option C at clarify): more schema; the CEO chose the trigger form.
