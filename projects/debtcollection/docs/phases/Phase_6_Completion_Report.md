# Phase 6 — Collection Activities, Action Plan & Promise-to-Pay

**Status: COMPLETE.** The manual runtime gate was exercised and passed **by the client** on
`org5869857f`, 2026-09-19. Nothing in this report claims a runtime result the build awarded itself.

**Phase 7 is not started.**

---

## 1. Delivered scope

### Server-side lifecycle enforcement (packages 1–5)

`StatusTransitionValidator` was widened from `qdb_ptpstatus` alone to **both** `statuscode` and
`qdb_ptpstatus`, so an activity's own lifecycle is refused server-side rather than only in the
browser. `StatusTransitionMatrix.ActivityAllowed` is the C# source of truth and its TypeScript mirror
is parity-tested against it, so the two cannot silently diverge.

Proved live by the one transition `ImmutabilityGuard` does not already cover — `Cancelled → Open` —
because a rule that only ever agrees with an existing guard has not been shown to do anything.

### The write architecture (ADR-DCP-18, ADR-DCP-19)

`Xrm.WebApi.updateRecord` has no parameter for a request header, so `If-Match` cannot be sent through
it and Dataverse's optimistic concurrency is unreachable. Concurrency-controlled reads and writes
therefore go through a same-origin `fetch` confined to one file. An adapter built without that
transport **refuses** rather than falling back to an unguarded write.

Duplicate submission is prevented by a **client-chosen primary key** with `If-None-Match: *`, minted
when a form opens rather than when Save is pressed. A repeat is reported as success, not an error —
the record the user asked for exists.

Both decisions were settled by spike against the organisation rather than from documentation, and are
written up in `ADR_Phase6_Writes.md`.

### Domain, service and query layers (packages 6–8)

```
React UI  →  ActivityService  →  @dcp/domain  →  XrmCrmAdapter  →  WriteTransport
             (canonical → qdb_   (decides, with   (versioned I/O)   (the only file
              columns, binds)     no platform)                       that speaks HTTP)
```

React constructs no Dataverse payload, no navigation property, no ETag, no URL and no lifecycle rule.
`activityOperations.ts` holds the decisions; `activityService.ts` translates them; `bindLookup()` is
the only way a lookup is ever written.

Query modules: Case Activities, PTP, Action Plan, Follow-ups/My Day, Activity detail — all on the
Phase 4/5 paging contract (server-side filter/sort/page, opaque continuation, virtualization,
continuation reset and stale-response suppression on any query change).

### The forms (packages 9–13)

- **Collection Activity** — log, open, edit, complete, cancel. Activity type and outcome come from
  configuration, never a list in code. Outcomes are filtered to the chosen type, because an outcome
  belongs to one type. A retired configuration row renders on the record that uses it and is not
  selectable for a new one.
- **Configuration-driven behaviour** — `qdb_requiresnotes`, `qdb_requiresfollowup`,
  `qdb_followupdays` and `qdb_escalationrequired` drive the form. Escalation is **displayed as
  configuration and not acted on**; Phase 8 owns that.
- **Promise to Pay** — capture, edit, transition. Remains `qdb_collectionactivity` with a PTP activity
  type. No parallel model. Terms lock once an outcome exists.
- **Follow-ups / My Day** — an operational queue with a server-side window filter. No second
  follow-up entity: a follow-up is a date on the activity, which is why completing the work clears
  the queue.
- **Action Plan** — planned actions correlated with activities by activity type **id**, with the
  limitation stated on screen (KI-71).

### Two lines the authorisation drew, and where they are enforced

**A collector's promise outcome is never shown as financially verified.** Enforced in three places so
no screen has to remember it: `describePromiseVerification` is the single source of the sentence, an
"unverified" marker sits beside every outcome that claims payment in every grid, and the form states
it. Nothing infers payment from a DPD movement.

**No QDB policy is invented.** No maximum promise amount, horizon or count; no tolerance, grace period
or automatic broken threshold. The absences are asserted by tests that say why they are absent, so
adding a limit means deleting a test that explains the decision.

---

## 2. Gate results

### Automated — 1,133 tests

| Suite | Result |
|---|---|
| `@dcp/domain` | **373** |
| `@dcp/web` | **254** |
| `@dcp/api` | **313** |
| `@dcp/dataverse-client` | **32** |
| `@dcp/auth-adapters` | **14** |
| C# plugins (`Qdb.DebtCollection.Plugins.Tests`) | **147** |
| TypeScript type-check | clean |

### Live, against `org5869857f` — the full Phase 1–6 regression gate

| Gate | Result |
|---|---|
| `verify-qdb-schema` (Phase 1) | **19/19** |
| `smoke-qdb-plugins` (Phase 1) | **13/13** |
| `smoke-qdb-phase2` (core model) | **20/20** |
| `smoke-qdb-phase3` (configuration & strategy) | **19/19** |
| `smoke-qdb-phase4` (MIS integration) | **22/22** |
| `smoke-qdb-phase5` (query modules) | **45/45** |
| `verify-view-columns` (205 column and navigation-property names) | **17/17** |
| `verify-activity-lifecycle` (Phase 6 server enforcement) | **9/9** |
| `smoke-browser-writes` (Phase 6 transport) | **27/27** |
| `smoke-domain-operations` (Phase 6 domain, service, queries, configuration) | **58/58** |
| **Total live checks** | **249/249** |

### Data hygiene

Zero `SMOKE-` residue across activities, cases, contacts, accounts, activity types, outcomes and
strategies — verified after the full gate run, not merely after cleanup was called. Preserved
untouched: **5** `DEMO-` cases, **4,358** `ARR-` cases, **11** `P6-` activity types, **30** `P6-`
outcomes.

### Deployment

`qdb_dcp_workspace.html` deployed and published, **11/11**, stored content matching the built
artefact byte for byte.

---

## 3. Cloud runtime evidence — passed by the client

Exercised inside `main.aspx?pagetype=webresource&webresourceName=qdb_dcp_workspace.html` on
`org5869857f` against `DEMO-` records, 2026-09-19.

| Step | Result |
|---|---|
| 1 — Log an action | **PASS** |
| 2 — Open and edit | **PASS** |
| 3a — Configuration decides (required notes, escalation displayed) | **PASS** |
| 3b — Configured automatic follow-up suggested and persisted | **PASS** (after KI-77) |
| 3b-ii — Switching to an outcome needing none withdraws the suggestion | **PASS** |
| 3b-iii — A manually overridden follow-up persists unchanged | **PASS** |
| 4 — Follow-up round trip through My Day | **PASS** |
| 5 — Promise to Pay, including the unverified marking | **PASS** |
| 6 — Refusals, and the deliberate absence of policy limits | **PASS** |
| 7 — Two-window concurrency conflict, reload, consecutive saves | **PASS** |
| 8 — BFD (account) through the same components | **PASS** |
| 9 — Duplicate submission, Action Plan provenance wording, large data | **PASS** |

This closes **KI-56** (the workspace had never run inside Dynamics) and **KI-67** (concurrency proven
from node but not from a browser session cookie). Step 7 exercised a real two-window conflict on the
session cookie, which is the half `smoke-browser-writes` could not reach.

---

## 4. Defects found during Phase 6

Five were found by the build; **two were found only by running the software**, which is the point
worth carrying forward.

| # | Defect | Found by |
|---|---|---|
| KI-69 | A lookup's navigation property is not derivable and differs per entity | Write smoke, first run |
| KI-70 | A Dataverse PATCH answers 204 with **no ETag** | Write smoke, first run |
| KI-73 | The smoke cleaner reported success while leaving six rows | Live domain smoke |
| KI-74 | Configuration seeded unusable — 11 types inactive, 7 outcomes unowned | Reading the organisation |
| KI-75 | The workspace built its adapter with **no write transport** | **Client, runtime step 1** |
| KI-77 | A configured follow-up was derived invisibly; the adjacent button reported success | **Client, runtime step 3b** |

KI-74, KI-75 and KI-77 share one shape: **every automated test passed and the feature did not work.**
Each has since been given a guard that fails on the real failure — the catalogue a *form* would read
is asserted non-empty, the *production* session factory is driven rather than a hand-assembled
stand-in, and the derived follow-up is asserted *visible before saving* as well as written.

---

## 5. Open — none block Phase 6

| Ref | What is unresolved | Owner |
|---|---|---|
| **KI-65** | Ordering within the activity Open-state group is not in evidence. The matrix is deliberately permissive inside the group and strict at the boundary; tightening later removes transitions, which is the safe direction | QDB |
| **KI-66** | No activity outcome catalogue exists. The `P6-` set is synthetic, marked and reversible, and must never be read as agreed policy | QDB |
| **KI-71** | No schema mechanism links an activity to the strategy action that produced it. The Action Plan shows correspondence by type, never provenance, and says so on screen. `qdb_relatedrecordtype`/`qdb_relatedrecordid` were **not** repurposed | **Resolve before Phase 8** |
| **KI-72** | No PTP policy limits are in evidence — no maximum amount, horizon, count, tolerance, grace period or automatic broken threshold. None is enforced | QDB |
| **KI-76** | Whether a collector may override a configured follow-up date is not defined. The typed date is preserved because that loses no information, and the override is a visible act | QDB |

---

## 6. Timing

| | |
|---|---|
| Original estimate | **36.50** AI-assisted effective execution hours |
| Actual start | **2026-09-19 13:28:05** (+03:00 Asia/Qatar) |
| Actual end | **2026-09-19 21:05** (+03:00 Asia/Qatar) |
| Elapsed | **≈ 7h 37m** |
| Blocked (three rounds of client runtime validation) | **≈ 1h 15m** |
| Effective execution | **≈ 6h 20m** |
| Variance | **≈ 30.2 hours under** (≈ 83%) |

The estimate was never revised; it stands as the baseline and the variance is reported against it.

**The variance is an estimating error, not a productivity result, and it should not be used to set the
Phase 7 baseline without adjustment.** Phase 6 was estimated before the packages-1–5 scope review,
when server-side lifecycle enforcement was expected to need a plugin redesign and the concurrency
approach was undecided. Both turned out to be smaller than feared — the validator needed widening
rather than rewriting, and the concurrency question was settled by a 16-check spike in under an hour.

The blocked figure is bounded by the gaps between stopping for validation and the next commit; it is
an estimate from timestamps, not instrumented measurement, and is stated as approximate for that
reason.

---

## 7. Boundaries respected

No Phase 7 communications transport. No Phase 8 automated strategy, assignment or escalation — the
escalation flag is recorded and displayed, never acted on. No Phase 9 advanced processes. No Phase 10
reporting. No new entity, column, relationship or choice. Only `org5869857f` was touched; Production,
On-Prem, the DA module, customer master schema, Facility Limit, Customer Product, the `qdb_crmlogs`
schema, the legacy `msst_` retirement and unrelated QDB solutions were not.

**On-premises status: Compatible by Design — Runtime Test Pending.** The same source targets 9.1 and
9.2 and reads its API version from the host, but no on-premises execution has occurred and none is
claimed.
