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
| **WP15** | *new* | **Deceased & Insurance Claims — discovery.** No deceased process and **no credit-life insurance** found; BFD claims are guarantee/trade, not death. 724 flags remain data-only | 14 | **✅ discovery done — STOPPED at the gate** — KI-124/125/126/127/128 | 2.00 |
| **WP16** | *new* | **Deceased Review — Collection-side only.** QCB indication read and reviewed; **no insurance module built** (KI-125). Case byte-identical before and after | 15 | **✅ done** | 2.50 |
| **WP17** | **12** | **▶ NEXT.** Operational queues and UI — assigned work, awaiting assignment, attention, due soon, overdue, escalated, legal, disputes, deceased, claims, restructuring **recommendation only** | 13, 14, 16 | pending | 3.00 |
| **WP18** | **13** | Real Dataverse runtime validation across the new modules | all | pending | 2.00 |
| **WP19** | **14** | Chrome QA journeys, on the verified QDB profile | 17 | pending | 3.00 |
| **WP20** | **15** | Regression and hardening | all | pending | 2.00 |
| **WP21** | **16** | Documentation, ADRs, Phase 8 closure | all | pending | 1.50 |

---

## Completed at gate — WP15 Deceased & Insurance Claims (discovery only)

| | |
|---|---|
| **Started** | 2026-09-22 |
| **Estimate** | **2.00 effective hours** (AI-assisted), in the separately tracked revised forecast — not the 36.50 baseline |
| **Expected completion** | same working session; the gate is a written report, not code |
| **Depends on** | WP14 (done). Nothing else — discovery is read-only |
| **Scope** | Read-only semantic discovery across the Cloud organisation and the repository. **No schema, no entity, no configuration, no automation, no communication change, no lifecycle change.** |
| **Deliverable** | Structured report, sections A–H, then **STOP** for architecture review |

**Known risks, stated before starting:**

1. **The environment-parity trap, for the fourth time.** Legal, Restructuring and Complaint each
   looked absent on Cloud and were not. Every finding will be classified as *proven QDB process* /
   *present in Cloud* / *not present in Cloud, On-Prem confirmation required* rather than collapsed
   into "does not exist".
2. **The naming trap.** Restructuring was modelled as *Facility Amendment* and a name sweep missed
   it entirely. This sweep covers option-set **labels** and column names, not just entity names.
3. **Two capabilities, easily collapsed.** Deceased handling and insurance claims are related and
   distinct. Conflating them would produce one lifecycle where QDB may have two, or none.
4. **The 724 MIS records invite an interpretation.** What that indicator *means* is itself a
   discovery question; treating it as a verified death event is the most likely wrong turn.
5. **Security gaps are likely.** KI-100, KI-111, KI-116 and KI-120 were all the same shape. Expect
   a fifth and record it rather than working around it.

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
