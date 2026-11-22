# Research: Scheduled Surveys at HL Scale (001-scale-per-org)

Date: 2026-11-21. Sources: the code on main `d0079a84` (kit 1.2.0.4), QA-D2 timings, the spec's Clarifications.
GitHub research (Article XVII): not applicable. This is a change to the engine's own scheduling inside a CRM
plugin; no library pages Dataverse queries or resumes plugin work (ADR-003 keeps the plugin free of
third-party libraries). Recorded in `dependencies.md`.

## R1 — Why today's scheduled pass cannot run at HL scale

- **Finding**: `ScheduledTriggerPass.Run` builds the candidates of **every** due trigger first
  (`BuildAll`), reading each whole population (`CustomerPopulationReader.GetActiveCustomers` = every active
  customer, unpaged), pins a form version per customer, and only then dispatches customer by customer. The
  budget is checked between triggers and between customers, but a spent budget during building answers null
  and the next call **starts over**. At ~165 ms per customer, 10,000 customers is ~28 minutes in one
  transaction: the call is cut by the 2-minute limit and rolls back, every time.
- **Decision**: replace "build everything, then dispatch" with **one trigger at a time, page by page**, with
  the run's position saved on the trigger (R2–R4).
- **Alternatives**: a bigger budget (impossible: hard 2-minute sandbox limit, Article X); a separate
  asynchronous job per trigger (async plugins have the same 2-minute limit and add a second scheduler).

## R2 — Order of same-day triggers (clarified: one at a time, priority order)

- **Decision**: due triggers are ordered by priority (unset: milestone 0, others 100, as today) and then by
  trigger id for a stable order. The pass works on the first trigger whose run for its period is not
  complete; it moves to the next only when that run completes.
- **Consequence for "two surveys due for one customer"** (today resolved per customer by
  `InvitationDispatcher` as **PriorityLost**): the higher-priority survey is now sent first, and when the
  lower-priority one reaches that customer the 30-day **fatigue** rule applies.
  - Trigger set to **Postpone** (the default): result unchanged — a Postponed invitation, as today
    (`Run_TwoSchedulesDueForOneCustomer_SendsTheHigherPriorityAndPostponesTheOther` still holds).
  - Trigger set to **Drop**: still dropped, but logged with reason **Fatigue** instead of **PriorityLost**.
  This is the only visible difference at ~450 customers (FR-007); flagged for the CEO's architecture decision.
- **Alternatives**: interleaving triggers per customer page (keeps PriorityLost, but different populations —
  all active vs active in a source — cannot be paged together, and it contradicts the clarified answer).

## R3 — Paging the two populations

- **All active customers**: reuse `AudienceReader.ReadPage` with the "all active customers" audience query
  (`AudienceQuery`, the same query the one-time send uses), paging cookie + page number, page size 25.
- **All active customers** resumes from the paging cookie, which is keyed on the last record's id, so
  customers leaving or joining the set between calls do not shift the position.
- **Active in a source during the period** (amended after `/speckit-analyze` C3): the existing
  `CustomerPopulationReader.BuildFetchXml(query, pageNumber)` pages by **page number**. If customers leave the
  set between calls (allowed by the spec's edge case), every later customer moves up and some would be
  **skipped**, breaking FR-003/SC-003. **Decision**: resume by key instead — keep `distinct` and
  `order by customer`, add `customer > lastCustomerId` and always read the first page of 25. The cursor
  stores the last customer id. Re-reading a customer is harmless (per-page dedupe); skipping one is not.
- **Page size**: 25 customers, shared with the one-time send (`OneTimeSendService.PageSize`, DEF-CSE-002):
  the budget is checked between pages, so a page bounds the overrun to ~4 s. A technical constant, not a
  business rule (same as the existing one-time page size).

## R4 — Saving the position and not inviting anyone twice

- **Decision**: reuse the trigger's run record from the one-time feature — `qdb_run_status`,
  `qdb_run_started_on`, `qdb_invited_count`, `qdb_postponed_count`, `qdb_suppressed_count`, `qdb_run_cursor`,
  `qdb_run_message` — and add `qdb_run_period_key`, `qdb_run_evaluated_count`, `qdb_run_failed_calls`,
  `qdb_run_progress_on` (data-model.md). Progress is written after each page with a **row-version
  conditional update** (the one-time store's `TrySaveProgress` pattern), so of two overlapping calls only one
  advances the run.
- **Duplicates**: each page checks the period's dedupe keys **for that page's 25 customers only**
  (`DedupeKey.ForSchedule(setup, customer, period)`), instead of loading every key of the period on every
  call (10,000 rows per call at HL). The alternate key `qdb_invitation_dedupe` remains the backstop.
  A call that fails loses only its own pages (one transaction, DEF-CSE-002); the next call redoes them and
  the per-page check skips any customer already invited by an earlier committed call.
- **Period change**: a run belongs to one period (`qdb_run_period_key`). A trigger whose stored run is for an
  earlier period and is complete starts fresh for the new period; one still running finishes first (BR-E2).

## R5 — Counting failed calls (FR-011): the transaction problem

- **Finding**: a call that fails rolls back **everything it wrote**, including any failure counter it tried
  to save. A failing call therefore cannot record its own failure. A platform fault on one customer's
  create also aborts the whole transaction, so "catch, log and continue" inside the call cannot work for
  platform faults (review item 2, DEF-CSE-002).
- **Decision**:
  - **Per customer, inside the call**: everything the engine can foresee is already logged and skipped
    without an exception (fatigue, form not published, no customer, delivery None, outside window). Those
    stay as they are and satisfy FR-011's "logged and skipped" for every foreseeable case.
  - **A whole call failing**: the scheduler script, which runs outside CRM's transaction, reports it. After
    a failed `Pass = Daily` call it makes one more call, `Pass = RecordFailure`, in its own transaction.
    That call adds 1 to `qdb_run_failed_calls` on the **target trigger** and, at the threshold (Survey
    Settings `qdb_stuck_after_failed_calls`, Article V), sets run status **Stuck** with the reason in
    `qdb_run_message` (cut to its 2,000-character limit). The script still exits 1, so monitoring alerts on
    every failure.
  - **Target trigger** (amended after analysis C1): the trigger the Daily pass would work on next, chosen by
    the same rule (R7 selection, priority order, run not complete, not Stuck). It is **not** "the trigger
    whose status is Sending": a failure on a trigger's very first page rolls back its Sending status, so that
    rule would find nothing and the trigger would never become Stuck. With no target, RecordFailure does
    nothing and says so.
  - **Threshold** (amended after analysis D1): the settings column is required with schema default 3; the
    code never supplies its own value. If it is empty, RecordFailure refuses with a message naming the
    setting (Article V).
  - **Which pass failed** (analysis A1, accepted): postponed release runs before the scheduled pass in the
    same Daily call, so a postponed-release fault is also counted against the target trigger. Accepted: the
    alert fires either way, the Stuck reason says "the daily call failed while this survey was next", and
    the plugin trace records which pass was running when the fault happened (one trace line at the start of
    each pass), so the administrator finds the cause there. Telling the passes apart would need a new input
    or a second Custom API, rejected as more schema for a rare case.
  - **A successful page** resets `qdb_run_failed_calls` to 0.
  - **A Stuck trigger** is skipped by later calls, so lower-priority triggers can proceed, and is retried on
    the first Daily call of each new day — "new day" meaning the run date is later than the date of its
    `qdb_run_progress_on`; when the cause is fixed the retry succeeds and the run continues
    from its saved position. An administrator can also deactivate and reactivate the setup.
- **Alternatives**: a separate Custom API for recording failures (more schema for the same effect); a
  counter in a local file on the scheduler server (invisible in CRM; the spec requires Stuck on the form);
  retrying silently (rejected by the CEO, option C).

## R6 — The other daily passes at 10,000 customers (FR-008)

- **Postponed release** (`PostponedReleasePass`): checks the budget **per invitation**; released or
  discarded invitations leave the "Postponed" set, so the next call continues naturally. **No change.**
- **Retention** (`RetentionPass` → `BudgetedDeletion`): deletes **one item at a time** with a budget check per
  item, responses (and their answers) first, then invitations, then suppression logs; deleted rows leave the
  next query. **No change.**
- Both read their candidate ids with `RetrieveAll` (ids only); at HL's volume (~10,000 invitations a month,
  ~330 a day reaching 730 days) the id lists are small. Evidence: the live test runs the daily passes with
  the 2,500-customer run (quickstart).

## R7 — Interaction with the daily gate and missed-day catch-up

- The daily gate records a date only when all daily passes complete (DEF-CSE-003). A scheduled run in
  progress keeps the scheduled pass incomplete, so later calls on the same run date continue it.
- **Selection** (amended after analysis C2): the scheduled pass works on triggers **due on the run date plus
  every trigger whose run is unfinished** (Sending, or Stuck and due a retry). Without the second part, a
  quarterly run that is Stuck or still going on day 2 of the quarter would never be picked up again,
  because the trigger is not "due" on day 2.
- **Gate with Stuck runs** (C2): the scheduled pass counts as complete for the day when every selected run is
  Sent or Stuck. So a Stuck survey does not hold the gate open (other days are not blocked), and the next
  day's selection picks it up again for its daily retry. The gate itself does not change.

## R8 — Estimate

About **7–9 dev-days**: run store + paged pass + ordering + RecordFailure (4–5), schema + form (1), tests
(included, TDD), live 2,500 test + kit (1.5–2), docs (0.5).
