# Phase 8 — work-package tracker

Authoritative sequence for the remainder of Phase 8, after the QDB sequencing decision of
2026-09-21. It supersedes the ordering in `Phase8_Discovery.md` §9 while preserving every original
work-package number, so nothing in the history has to be re-read to follow this.

---

## The decision

Restructuring / Workout / Facility Amendment is **parked**. It is a **sequencing decision, not a
scope cancellation**, and the downstream integration is **not** counted as delivered.

The remaining functional priority is: **Disputes & Complaints → Legal Collection-side completion →
Deceased & Insurance Claims → operational queues/UI → validation, QA, hardening, closure.**

---

## Baseline and forecast — kept apart

| | Hours |
|---|---|
| **Original Phase 8 baseline** (16 WPs, unchanged) | **36.50** |
| Delivered against it — WP1–WP11 | 26.00 |
| Remaining from the original baseline — WP12–WP16 | 10.50 |
| **Revised forecast due to approved scope sequencing/additional functional modules** | **+9.50** |
| Forecast total to Phase 8 closure | 46.00 |

**The 36.50-hour baseline is not rewritten.** The additional forecast covers two functional modules
the original sixteen packages did not contain — Disputes & Complaints, and Deceased & Insurance
Claims — which the original plan carried only as Phase 9 placeholders in the navigation rail.

---

## ACTIVE — to complete now

| Revised WP | Original WP | Scope | Depends on | Status | Est. hrs |
|---|---|---|---|---|---|
| **WP12** | *new* | **Disputes & Complaints — discovery.** Complaint = native `incident`, 108 custom columns, established. Collection Dispute **not modelled by QDB**. No collection-control policy exists | 8 | **✅ done** — KI-118/119/120 | 2.00 |
| **WP13** | *new* | **Disputes & Complaints — Collection-side capability + Complaint integration.** `casetypecode` resolved by label; BFD/HL both proven; `qdb_complaintcaseid` traceability | 12 | **✅ done** — KI-121/122 closed, KI-123 opened | 2.50 |
| **WP14** | 9, 10 (completion) | **Legal hand-off — Collection-side completion.** State DERIVED from records; `ReadyForHandoff` unreachable while KI-109 is open; queue buckets carry no Legal taxonomy | 9, 10 | **✅ done** | 1.50 |
| **WP15** | *new* | **Deceased & Insurance Claims — discovery.** HL and BFD separately. The 724 MIS deceased flags remain **data-only** | 14 | **▶ NEXT** | 2.00 |
| **WP16** | *new* | **Deceased & Insurance Claims — Collection-side capability.** Deceased identification and insurance claim modelled **independently**, never collapsed into one status | 15 | pending | 2.50 |
| **WP17** | **12** | Operational queues and UI — assigned work, awaiting assignment, attention, due soon, overdue, escalated, legal, disputes, deceased, claims, restructuring **recommendation only** | 13, 14, 16 | pending | 3.00 |
| **WP18** | **13** | Real Dataverse runtime validation across the new modules | all | pending | 2.00 |
| **WP19** | **14** | Chrome QA journeys, on the verified QDB profile | 17 | pending | 3.00 |
| **WP20** | **15** | Regression and hardening | all | pending | 2.00 |
| **WP21** | **16** | Documentation, ADRs, Phase 8 closure | all | pending | 1.50 |

---

## PARKED

### Restructuring / Workout / Facility Amendment

**Status: Discovery Complete — Parked by QDB sequencing decision; resume after the priority
modules.** Original **WP11**. Discovery commit **`c64759cc`**; full evidence in
`docs/WP11_RestructuringDiscovery.md`. Downstream integration is **not delivered**.

Restart point and everything needed to resume without repeating discovery:
**`docs/Restructuring_Parked_Checkpoint.md`**.

**KI-114, KI-115, KI-116 and KI-117 remain OPEN and must not be closed.**

Until the user says **"Resume Restructuring"**, no restructuring entity, lifecycle, lookup,
facility mapping, security grant or code/name heuristic is created, and
`qdb_loan_amendment` is not modified. The operational UI shows the Collection-side
**recommendation only** — never a fabricated Facility Amendment status.

---

## Completed

| WP | Scope | Commit |
|---|---|---|
| 1–2 | Discovery; KI-71 provenance provisioning | `032a47b0` |
| 3–4 | Strategy identity contract; provenance guard | `032a47b0` |
| 5 | Re-evaluation dispositions | `032a47b0` |
| 6 | Assignment decision | `032a47b0` |
| 7 | TAT and escalation | `032a47b0` |
| 8 | Action Plan upgrade — KI-71 closed | `780a9f27` |
| 9 | Legal hand-off | `88b9ec95` (discovery `aad2a334`) |
| 10 | Legal visibility and traceability — KI-110 closed | `8ddad647` |
| 11 | Restructuring discovery — **parked, see above** | `c64759cc` |

---

## Runtime statements — never collapsed

Carried forward verbatim; **not** to be shortened to "Legal integration validated":

Legal Recommendation visibility **VALIDATED** · DCP → Litigation traceability **VALIDATED** ·
Litigation status visibility **VALIDATED under the tested administrator identity** · BFD Account
resolution **VALIDATED** · HL → BFD resolution **NOT VALIDATED / KI-108** · Legal hand-off
idempotency **VALIDATED** · Legal qualification policy **UNDEFINED / KI-109** · Collection Officer
Legal read access **NOT VALIDATED / KI-111** · QDB Legal process execution **UNPROVEN on Cloud** ·
On-Prem Legal runtime **PENDING**.
