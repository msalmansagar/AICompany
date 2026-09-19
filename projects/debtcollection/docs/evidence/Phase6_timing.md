# Phase 6 — effort estimate and time tracking

**Timezone:** `Asia/Qatar` (UTC+03:00); the machine clock is already on it, so no conversion is applied.
Every timestamp is captured from the machine at the moment it happened, and segment boundaries come
from git commit timestamps. **Nothing here is reconstructed from memory.**

---

## Start

| | |
|---|---|
| **Start (Asia/Qatar)** | **2026-09-19 13:28:05 (+03:00)** |
| Machine UTC at start | `2026-09-19T10:28:05.115Z` |
| **Original estimated effort** | **36.50 hours** |
| **Original expected completion** | **2026-09-21 01:58:05 (+03:00)** |
| Branch | `feat/dcp-phase6-activities-ptp`, from the approved Phase 5 baseline `76f84ce2` |
| Estimate produced | 2026-09-19 13:41 (+03:00), after the scope review and before any implementation |

**This estimate is independent.** It is not anchored to Phase 5's outcome. Phase 5 was largely a
*conversion* of an approved design onto contracts Phase 4 had already proved; Phase 6 is the first
phase that **writes** to CRM from the browser, the first since Phase 1 to change the **plugin
assembly**, and the first to need **optimistic concurrency** — none of which has a precedent in this
repository.

---

## What the scope review found

### Reusable, and substantial

| Already built | What Phase 6 gets for free |
|---|---|
| `packages/domain/activityLifecycle.ts` | `ActivityStatus` (6), `ACTIVITY_STATUS_CODES`, `ACTIVITY_STATE_CODES`, `PtpStatus` (6), `PTP_STATUS_CODES`, `PTP_TRANSITIONS`, `isPtpTransitionAllowed`, `isActivityImmutable` — already parity-tested against the C# source |
| `StatusTransitionMatrix.cs` | The PTP matrix **and** the `ActivityStatus` constants, server-side |
| `StatusTransitionValidatorPlugin` | Registered on `qdb_collectionactivity` Update, filtering `qdb_ptpstatus` — the PTP lifecycle is already enforced on the organisation |
| `ImmutabilityGuardPlugin` | A completed activity is already frozen against Update and Delete |
| `DefaultStatusAssignerPlugin`, `ActivitySubjectComposerPlugin` | Create-time status and subject composition already run |
| `CollectionActivityRepository` | `findActivityTypeId`, `create`, `updatePromiseStatus`, `complete` |
| Phase 4 `paging.ts` + Phase 5 `DataGrid` | Server-side paging, virtualization, stale suppression, continuation reset — the §15 large-dataset requirement is already satisfied by the engine every list uses |
| Phase 5 `XrmCrmAdapter` | `create` and `update` exist and are typed, though **never exercised at runtime** (KI-56) |
| Phase 5 design system, Pivot, Card, FieldList, pills | The approved visual language for every new form |

### Genuinely new

1. **The activity `statuscode` lifecycle is not enforced server-side.** The validator plugin filters
   `qdb_ptpstatus` only; there is no activity transition matrix and no registered step for it. §4
   requires server-side validation, and the workspace writes **directly through `Xrm.WebApi`** with no
   service layer in between — so "server-side" here means *a plugin*. This is a C# change, a new
   registered step, an assembly rebuild and a redeploy.
2. **Writing from the browser has never been executed.** `create`, `update` and `retrieveByKey` on
   `XrmCrmAdapter` are typed and unit-tested and have never made a real call. Phases 5's three
   runtime defects — `Buffer`, the absolute `nextLink`, the empty `$select` — were all found the first
   time a path ran for real, and the write path is the next such path.
3. **Optimistic concurrency has no established mechanism.** `Xrm.WebApi.updateRecord` exposes no
   `If-Match` and no way to set a header, so Dataverse's own ETag concurrency is not reachable
   through the client API. §12 requires this and it needs a spike and an ADR before any write screen
   is built on a guess.

### Configuration that does not exist yet

| Table | Rows in the organisation | Consequence |
|---|---:|---|
| `qdb_collectionactivitytype` | **1** — and it is my own `DEMO-PTP` seed | The eleven approved activity types in §3 are not provisioned. Phase 6 must seed them as reference data |
| `qdb_activityoutcome` | **0** | **Blocks automatic outcome behaviour.** The table is richly modelled — `qdb_requiresfollowup`, `qdb_followupdays`, `qdb_requiresnotes`, `qdb_escalationrequired`, `qdb_sequence` — so the outcome record is *configuration that drives Phase 6 behaviour*. The catalogue itself is QDB's policy and is not in evidence |

That second row matters more than its size suggests: follow-up scheduling and whether notes are
mandatory are **read from the outcome record**, not decided in code. The mechanism can be built now;
the catalogue is a QDB confirmation, and inventing one would be exactly the kind of invented policy
§8 and §24 forbid.

---

## Work-package estimate

| # | Work package | Hours | What is in it |
|---:|---|---:|---|
| 1 | Scope review, schema discovery, design | 1.50 | This document, the ADR for the activity lifecycle, the concurrency decision record |
| 2 | Activity type & outcome reference data | 1.00 | Seed the eleven approved types idempotently and reversibly; build the outcome-driven mechanism; raise the catalogue as a QDB confirmation |
| 3 | **Activity transition matrix (C#)** | 3.00 | `ActivityAllowed` in `StatusTransitionMatrix`, the validator branch, a new registered step with a `statuscode` PreImage, xUnit coverage, assembly rebuild and redeploy |
| 4 | TypeScript mirror + parity test | 0.75 | `ACTIVITY_TRANSITIONS` in the domain, parity-tested against the C# source as the case and PTP matrices already are |
| 5 | **Concurrency spike + ADR** | 2.00 | What is actually reachable from `Xrm.WebApi`; whether a same-origin `fetch` with `If-Match` is warranted; Cloud **and** 9.1 compatible; decided against the platform, not from documentation |
| 6 | Domain: activity operations & PTP validation | 2.50 | Create/complete/cancel/outcome/follow-up commands, §8 validation with no invented thresholds |
| 7 | Browser write path + idempotency | 2.00 | `create`/`update` exercised for real; duplicate-submit protection; §11 |
| 8 | Query modules | 2.00 | Activities by case, PTP history, follow-up queues, the Action Plan projection — all server-narrowed |
| 9 | Case Workspace — Actions tab | 2.50 | List, create, open, edit where allowed, complete, outcome, follow-up |
| 10 | Case Workspace — PTP tab | 2.50 | List, create, open, update, outcome, and an honest verification state |
| 11 | Action Plan view | 1.50 | Projection of Phase 3 strategy actions against actual activities; planned vs manual distinguished |
| 12 | Follow-up + My Day | 1.50 | Upcoming and overdue from the same operational data, not a second copy |
| 13 | Dialog/form framework | 2.00 | Required fields, validation messages, loading, save-in-progress, success and failure states |
| 14 | Security validation | 1.50 | Real privilege tests: permitted, denied, inaccessible related record, inactive configuration |
| 15 | Automated tests | 3.50 | Domain, service, React — the §21 matrix |
| 16 | **Live Cloud smoke** | 2.00 | Real Web API writes against `org5869857f`, zero residue even on failure paths |
| 17 | Volume & paging evidence | 1.00 | Against the 4,358-case Housing Loan dataset already loaded |
| 18 | Phase 1–5 regression | 0.75 | Every prior gate, schema verification, style contract, packaging |
| 19 | Deployment + publish | 0.50 | Web resource and plugin assembly |
| 20 | Documentation & completion report | 2.50 | ADRs, Known Issues, Risk Register, Testing Strategy, Change Log, tracker, §26 report |
| | **TOTAL** | **36.50** | |

### Why this is larger than Phase 5

Phase 5 converted an approved design onto contracts that already existed, and its largest risk — the
large-data engine — landed in a fraction of its estimate because Phase 4 had already shaped it.
Phase 6 has three things with no precedent in this repository: a **plugin assembly change** (last
touched in Phase 1), the **first browser writes**, and **concurrency**. Packages 3, 5 and 7 are where
the uncertainty is, and they are deliberately the ones with the most hours against them.

### Risks to the estimate

| Risk | Effect if it lands |
|---|---|
| The plugin assembly will not rebuild or re-register cleanly against the current org | Package 3 grows; every activity-lifecycle guarantee depends on it |
| `Xrm.WebApi` offers no usable concurrency, and a same-origin `fetch` write path is needed | Package 5 and 7 grow, and a second transport needs an ADR and its own tests |
| The first real browser writes expose the same class of defect the first real reads did | Packages 7 and 16 grow — this is expected rather than feared, which is why the live smoke is budgeted at 2.00 h |
| QDB cannot supply the activity outcome catalogue during the phase | Outcome-driven follow-up and notes-required stay mechanism-only; isolated per §24 so it blocks nothing else |
| Concurrency cannot be enforced identically on 9.1 and Dataverse | The adapter absorbs it, or the difference is recorded as a platform-specific component with its reason |

---

## Segment ledger

| # | From | To | Hours | Kind | Evidence |
|---|---|---|---:|---|---|
| 1 | 19 Sep 13:28:05 | *in progress* | — | Execution | Scope review, schema discovery, estimate |

*Updated as the phase runs.*

---

## Completion

*Recorded at the end of the phase from the machine clock.*

| | |
|---|---|
| Revised estimate, if any | — |
| Actual completion | — |
| Wall-clock elapsed | — |
| Blocked time | — |
| Effective Claude execution | — |
| Estimate variance | — |
| Percentage of estimate consumed | — |
