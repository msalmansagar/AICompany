# Phase 9 — Advanced Collection Processes · tracker

**Branch** `feat/dcp-phase9-advanced-processes` · **base** `81adc5a7` (`origin/main`, Phases 1–8
integrated) · **started 2026-09-22 21:30 +03 (Asia/Qatar)**

---

## Scope

**Active:** Legal completion · Deceased handling · Insurance Claims decision gate · Collection
Dispute · Customer Complaint · advanced-process operational UI · cross-process security, audit and
idempotency · testing, regression and hardening.

**Parked by QDB — no implementation effort:**

- **Restructuring / Workout — PARKED by QDB · Downstream Integration Deferred**
- **Field Visit — PARKED by QDB · Discovery & Implementation Deferred**

**Out of scope:** Warning Letters.

Phase 9 is **not greenfield**. Phase 8 delivered substantial foundations for Legal, Deceased Review
and Dispute/Complaint. Phase 9 inspects those and implements only what authoritative evidence
supports.

---

## The reconciliation finding that shapes this phase

**Three of the four active processes cannot be *concluded*, and it is a configuration gap, not a
code gap.**

`qdb_activityoutcome` holds 30 rows and **every one is bound to a specific activity type**. Read
live from `org5869857f`:

| Activity type | Outcomes configured |
|---|---|
| P6-CALL · P6-PAYREQ · P6-FOLLOWUP · P6-MEETING | 7 each |
| P6-FIELDVISIT | 2 |
| **P6-DECEASED** | **0** |
| **P6-LEGALREC** | **0** |
| **P6-DISPUTE** | **0** |
| P6-RESTRUCTREC · P6-GENERAL · P6-PTP | 0 |

A `DeceasedReviewRow` reaches `ReviewRecorded` only when the review activity carries an **outcome**
(`resolveState`: `review.outcome ? 'ReviewRecorded' : 'UnderReview'`). The generic completion path
already exists — the Actions grid opens any activity in `ActivityDialog`, which completes it with an
outcome — so **nothing is missing in code**. What is missing is the outcome catalogue for these
three types, and *what those outcomes should be* is precisely the question KI-124 asks about the
deceased indication and KI-109 asks about Legal.

**Phase 9 will not invent an outcome taxonomy.** Naming a "Confirmed deceased" outcome would decide,
in configuration, the business question QDB has not answered. The phase instead makes the blocked
state legible and records the dependency.

---

## Reconciliation matrix

| Process | Classification | Evidence |
|---|---|---|
| **Legal** | **Foundation Delivered — Phase 9 Completion Required** *(handoff Blocked Pending QDB)* | Recommendation activity type, `qdb_legalrequestid` traceability, downstream status read, 8 trace states, fail-closed handoff contract, Legal queue bucket. **0 activities have ever used the approval mechanism** (KI-109). HL→BFD unresolved (KI-108). Read security unresolved (KI-111). **0 outcomes on P6-LEGALREC** |
| **Deceased** | **Foundation Delivered — Phase 9 Completion Required** *(conclusion Blocked Pending QDB configuration)* | Indication read, deterministic review id, officer *Record deceased review*, idempotent create, persisted re-read, `UnderReview`. **`ReviewRecorded` unreachable: 0 outcomes on P6-DECEASED** |
| **Insurance Claims** | **Deferred — No Authoritative Process** | Phase 8 WP15 found no credit-life / death-benefit / mortgage-protection process; `qdb_aldhameenclaims` is guarantee claims, unrelated (KI-125). Phase 9 performs a bounded recheck only |
| **Collection Dispute** | **Foundation Delivered — limited completion** | Recorded through the existing *Log action* path (P6-DISPUTE active), kept separate from Complaint, **no collection effects by design** (KI-119 unresolved). **0 outcomes on P6-DISPUTE** |
| **Customer Complaint** | **Foundation Delivered (read-only) — creation Blocked Pending QDB security** | Native `incident`, case type resolved from **live metadata** (1 Inquiry / 2 Complaint / 3 Suggestion — never hard-coded), `qdb_complaintcaseid` traceability, HL and BFD both proven. Raising one is not in the product; KI-120 unresolved |
| **Restructuring / Workout** | **PARKED by QDB** | Discovery complete (WP11, `Restructuring_Parked_Checkpoint.md`). KI-114/115/116/117 open. **No implementation effort** |
| **Field Visit** | **PARKED by QDB** | P6-FIELDVISIT activity type exists and carries 2 outcomes — **preserved, not extended**. No discovery, no entity, no UI, no lifecycle |

---

## Work packages

| WP | Scope | Est. hrs |
|---|---|---|
| **WP1** | Baseline, reconciliation, dependency map, Insurance Claims decision gate (bounded recheck) | 2.00 |
| **WP2** | Advanced-process **conclusion dependency**: make "cannot be concluded — no outcome configured" legible once, across Legal, Deceased and Dispute | 1.50 |
| **WP3** | Deceased Review completion path — open and conclude from the card, honest blocked state, no invented outcome | 2.00 |
| **WP4** | Legal Collection-side completion — legibility of blocked handoff; fail-closed preserved | 1.50 |
| **WP5** | Dispute and Complaint completion — visibility, no invented effects, no officer-raised complaint | 1.50 |
| **WP6** | Advanced-process operational UI — timeline/history, state legibility (available / read-only / pending / blocked / deferred / historical) | 2.50 |
| **WP7** | Cross-process security, authorisation, audit and idempotency verification | 1.50 |
| **WP8** | Large-data behaviour for new and changed views | 1.00 |
| **WP9** | Cloud runtime and browser validation | 3.00 |
| **WP10** | Full regression and hardening | 2.00 |
| **WP11** | Documentation, KI reconciliation, Phase 9 closure | 1.50 |
| | **Work-package total** | **20.00** |
| | Debugging allowance (unallocated) | **1.50** |
| | **Phase 9 baseline** | **21.50** |

**Parked areas carry no implementation WP** — only the tracker and documentation entries needed to
preserve their status.

### Estimate by activity

| | Hours |
|---|---|
| Reconciliation / discovery | 2.00 |
| Domain / contracts | 2.00 |
| Implementation | 4.50 |
| UI | 2.50 |
| Unit / component testing | 2.50 |
| Cloud runtime validation | 1.50 |
| Browser / runtime validation | 1.50 |
| Regression | 2.00 |
| Debugging allowance | 1.50 |
| Documentation / closure | 1.50 |
| **Total** | **21.50** |

---

## Timing

| | |
|---|---|
| **Start** | **2026-09-22 21:30 +03 (Asia/Qatar)** |
| **Baseline** | **21.50 effective hours** (AI-assisted) |
| **Expected completion** | **2026-09-24, by ~18:00 +03** |
| Blocked / waiting time | tracked **separately**, not inside the baseline |

Any scope change records: original baseline · the change · revised forecast · reason · effective
hours · blocked hours, separately. **The 21.50 baseline is not rewritten.**

### Checkpoint — 2026-09-24 09:20 +03 (after the restart)

| | |
|---|---|
| **Current time** | **2026-09-24 09:20 +03 (Asia/Qatar)** |
| **Elapsed wall-clock since start** | **35.83 h** |
| **Effective engineering time so far** | **2.18 h** measured |
| **Non-working time (separate)** | **33.62 h** — see below |
| **Delivered, at estimate** | WP1 2.00 · WP2 1.50 · WP3 2.00 · WP4/WP5 conclusion banner ≈ 1.50 = **7.00** |
| **Remaining, at estimate** | WP4/WP5 rest 1.50 · WP6–WP11 11.50 · debugging allowance 1.50 = **14.50** |
| **Baseline** | **21.50 — unchanged** |
| **Forecast completion** | **2026-09-24 ~18:00 +03 — kept.** Risk: WP9's browser validation needs the Chrome extension paired. That can wait on the user, and any such wait is recorded as blocked time |

**How "effective" was measured.** From the session transcripts' own message timestamps: the
intervals between consecutive steps, counting only gaps shorter than 15 minutes. It is measured,
not estimated, and it is not the same unit as the estimate column. Phase 8 recorded estimate-shaped
actuals, so this phase's figures are not directly comparable with Phase 8's.

**Non-working intervals** (+03):

| From | To | Hours | What |
|---|---|---|---|
| 09-22 22:37 | 09-23 15:44 | 17.12 | Idle between sessions, after the start plan |
| 09-23 15:53 | 09-23 17:59 | 2.11 | Idle |
| 09-23 18:22 | 09-24 08:26 | 14.06 | **System restart interrupted WP4/WP5 mid-edit**; recovered from the working tree and transcript, nothing lost |
| 09-24 08:55 | 09-24 09:14 | 0.33 | Waiting on the user's continue decision |

**Blocked by a QDB decision: 0.00 h.** The restart is an interruption, not a block.

---

## Assumptions and dependencies

**Assumptions:** `org5869857f` remains the only authorised organisation · DEMO and synthetic
fixtures only, ARR read-only · the Phase 8 regression baseline of **1,903** tests holds · no QDB
configuration or security change arrives mid-phase.

**Dependencies, by process:**

| Process | Open KIs | Blocks what |
|---|---|---|
| Legal | KI-108, KI-109, KI-111, KI-112 | Officer hand-off, HL origination, officer visibility |
| Deceased | KI-124, KI-125, KI-126, KI-127, KI-128, KI-79 | Conclusion outcome, relief data, collection/communication treatment, documents |
| Dispute | KI-119, KI-120 | Any operational effect |
| Complaint | KI-120, KI-123 | Officer-raised complaints, historical case-type data |
| All three | **new KI — no outcomes configured** | Concluding an advanced-process activity |
| Cross-cutting | KI-100 | Anyone holding collection work |

---

## Status

**Phase 9 — CLOSED · Production Readiness Dependencies Outstanding** (closure review 2026-09-24).
Cloud Runtime Tested · System Administrator Runtime Validated · Collection Officer Runtime Validation
Pending · Dynamics 365 CE 9.1 On-Prem — Compatible by Design; Phase 9 Runtime Validation Pending.
Closure pack: `docs/Phase9_Closure.md` (§9 holds the review). Restructuring and Field Visit
**PARKED**; their status does not block Phase 9 closure.

| WP | State | Commit(s) |
|---|---|---|
| WP1 | Done | `49d972ab` |
| WP2 | Done | `d246265a` |
| WP3 | Done | `77d7ad94` |
| WP4 | Done | `5f41bba9`, `c524b48b` |
| WP5 | Done | `379e6610`, `7d1b9d5b` |
| WP6 | Done | `41c0ae7a`, `79121798`, `d1fe62a0`, `5687c317`, `9e90234a` |
| WP7 | Done | `d4c8bc21` |
| WP8 | Done | `4f43aa6e` |
| WP9 | Done — Cloud + browser (System Administrator evidence) | `bc509230` |
| WP10 | Done — 2,019 at the engineering candidate | — |
| WP11 | Done | `1bf3bf89` |
| Closure review | 1 MEDIUM fixed (KI-136), 1 LOW fixed, 1 LOW carried (KI-137); **2,027** passing, 0 skipped | `1259f6ee`, `94eb2fa5`, review commit |

### Closure timing

| | |
|---|---|
| Engineering complete | 2026-09-24 ~11:55 +03 — ahead of the 18:00 forecast |
| Effective engineering, measured | **4.80 h** to 11:55 (4.76 h was reported at 11:52) |
| Closure review, measured | ~0.6 h |
| Variance against baseline | **−16.70 h (−77.7%)** — different units; see the closure pack §7 |
| Non-working, separate | 33.62 h = 19.56 h idle + 14.06 h restart interruption |
| Blocked by QDB | 0.00 h |
| Baseline | **21.50 h — unchanged** |
