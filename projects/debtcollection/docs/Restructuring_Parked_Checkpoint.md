# Restructuring / Workout — PARKED checkpoint

**Status: Discovery Complete — Parked by QDB sequencing decision; resume after the priority
modules.**

Parked 2026-09-21. Discovery commit **`c64759cc`**. This file exists so that **"Resume
Restructuring"** can continue from here without repeating WP11 discovery. Nothing in it is a
conclusion about what should be built.

---

## 1. Where the evidence lives

| | |
|---|---|
| Full discovery | `docs/WP11_RestructuringDiscovery.md` |
| Discovery script — rerunnable, read-only | `crm/scripts/probe-restructuring.mts` |
| Corrected WP1 section | `docs/Phase8_Discovery.md` §3 (carries a supersession notice) |
| Commit | `c64759cc` |

The probe sweeps all 3,144 entities by logical **and** display name across 26 terms, all 1,622
workflows, all 500 Custom APIs, and the Process Engine's own content — 56 process/step/outcome/task
tables read row by row. Rerunning it costs one command and no state.

---

## 2. The accepted position

### BFD — downstream process **identified**

`qdb_loan_amendment`, display name **Facility Amendment**. Its `qdb_request_type` carries:

| Value | Label |
|---|---|
| 751090000 | Rescheduling |
| 751090004 | Rescheduling due to financial difficulty |
| 751090002 | Restructuring |
| 751090003 | Restructuring due to financial difficulty |
| 751090001 | Facility Amount |
| 751090005 | Renewal |
| 751090006 | QCB 2022 |

Cloud holds the entity and **3 forms** but **0 rows, 0 workflows, 0 custom plugin steps and 0
Custom APIs**. There is therefore **no proven operational workflow/runtime contract on Cloud**, and
the On-Prem production contract **requires QDB confirmation**.

Supporting tables: `qdb_repayment_plan` (the instalment schedule a rescheduling produces) and
`qdb_customer_restructure_history` (CIF-keyed history).

### HL — downstream process **not identified**

No housing-loan rescheduling or amendment table exists, and `qdb_loan_amendment` takes its customer
as an **`account`**. The On-Prem position **requires QDB confirmation**.

---

## 3. Open dependencies — all remain OPEN

| KI | What it blocks |
|---|---|
| **KI-114** | MIS facility → CRM `qdb_facility` resolution. A case carries `qdb_facilitynumber` as a string (`DEMO-BFD-8801`); `qdb_facility` holds unrelated names (`DEMO-FAC-0001`, `Lab`, `Cafe`). No match |
| **KI-115** | DCP → Facility Amendment traceability. Nothing links one back to collections; there is **no alternate key** |
| **KI-116** | Collection Officer Facility Amendment security. No DCP role holds `prvCreate` or `prvRead` |
| **KI-117** | Authoritative Restructuring Recommendation semantic identity. `qdb_category` is null on the activity type |

KI-108 (HL → BFD account resolution) also applies unchanged, since the downstream customer is an
`account`.

---

## 4. Unanswered QDB questions

| | |
|---|---|
| **Q1** | What is the authoritative Facility Amendment entry point? |
| **Q2** | What event qualifies a Collection recommendation for Facility Amendment? |
| **Q3** | Which Facility Amendment request type should Collections use? |
| **Q4** | How is MIS facility identity resolved to the CRM Facility required downstream? |
| **Q5** | What is the corresponding HL restructuring process? |
| **Q6** | Which team/user creates and processes Facility Amendments initiated by Collections? |

**None of these is to be resolved now.**

---

## 5. What exists already, and what does not

### Exists and is delivered

The Collection side needs no downstream decision. A Restructuring Recommendation is an ordinary
`qdb_collectionactivity`, so everything built in WP3–WP8 already applies to it unchanged: strategy
generation and identity, re-evaluation dispositions, assignment, TAT and escalation, and Action Plan
visibility. The activity type `Restructuring Recommendation` exists (code `P6-RESTRUCTREC`).

### Created for restructuring specifically

`crm/scripts/probe-restructuring.mts` — read-only discovery. That is all. **No production code, no
domain module, no schema, no test suite** was written for restructuring.

### Decisions explicitly NOT made

- whether the entry point is a direct create, an Action, a workflow, or an On-Prem mechanism;
- which request type a collections-initiated amendment should carry;
- how a facility is resolved;
- what qualifies a recommendation for hand-off;
- whether a DCP-side lookup to `qdb_loan_amendment` should be provisioned (the KI-110 shape);
- whether Collection Officers should have any access to Facility Amendment.

---

## 6. Constraints that hold while parked

Until the user says **"Resume Restructuring"**, do not:

create a new restructuring entity · create a parallel restructuring lifecycle · modify
`qdb_loan_amendment` · add speculative facility mappings · provision speculative restructuring
lookup fields · introduce code or name suffix heuristics to identify restructuring work · grant
security · assume a direct `qdb_loan_amendment` create is the production entry point.

The operational UI shows the Collection-side **recommendation only**, and must not display a
fabricated Facility Amendment status.

---

## 7. Exact restart point

1. Read this file and `docs/WP11_RestructuringDiscovery.md`. Do **not** re-run discovery for
   evidence — rerun `probe-restructuring.mts` only to confirm the organisation has not changed.
2. Put **Q1–Q6** to QDB. **Q1 first**: the entry point determines whether Q4 and the KI-115
   traceability decision are worth solving on Cloud at all — the same question Legal answered, and
   its answer reshaped WP9.
3. Once Q1 and Q4 are answered, the WP9 pattern applies directly: a hand-off decision module with
   explicit outcomes, a deterministic identity derived from the recommendation activity, a
   DCP-side lookup rather than a change to the downstream entity, and refusals that create nothing.
