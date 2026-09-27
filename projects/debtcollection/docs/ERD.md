# DCP — Target ERD (Phase 0)

**Status:** proposal for review · 2026-09-17 · aligned to the user's *Entity Relationship & System
Context Diagram* (deck slide 2), Master Prompt §68–69 and the Correction Prompt §4–9, §26–28.
Physical names in `EntityDictionary.md` / `FieldDictionary.md`. Nothing here exists on any org yet.

Legend: `[S]` existing system entity (reused, extended with `qdb_` columns where needed) ·
`[T]` transaction · `[C]` business configuration · `[P]` platform/integration · `[?]` conditional.

```
                     EXISTING CUSTOMER MASTER (per organisation)            EXISTING FACILITY MASTER
   ┌────────────────────────┐        ┌────────────────────────┐        ┌──────────────────────────────┐
   │ [S] contact  (HL)      │        │ [S] account  (BFD)     │        │ [S] <facility entity>        │
   │  + qdb_stopcontact     │   OR   │  + qdb_stopcontact     │        │  HL: TBD — Requires QDB Conf.│
   │  + qdb_deceasedflag …  │        │  + qdb_deceasedflag …  │        │  BFD: TBD — Requires QDB Conf│
   └───────────┬────────────┘        └───────────┬────────────┘        └──────────────┬───────────────┘
               └──────────────┬─────────────────┘                                     │
                              │ qdb_customerid (Customer lookup: contact | account)     │ CANONICAL: qdb_facilitynumber
                              │                                                        │ + sourceSystem. A physical
                              │                                                        │ qdb_facilityid lookup is an
                              │                                                        │ OPTIONAL per-deployment
                              │                                                        │ extension, not shared schema.
                              ▼                                                        ▼
                    ┌─────────────────────────────────────────────────────────────────────┐
                    │ [T] qdb_collectioncase                                              │
   ┌──────────────▶ │  case number · customer · customer type · facility number · product │ ◀──────────────┐
   │                │  cached MIS position (DPD, bucket, balance, arrears, instalment,    │                │
   │                │  NPL, last sync, as-of) · stage · statuscode (17) · owner · team     │                │
   │                │  strategy · priority · risk · episode no. · open/close/cure dates    │                │
   │                └───────┬───────────────────────┬───────────────────────┬─────────────┘                │
   │                        │ 1                     │ 1                     │ 1                            │
   │                        │ N                     │ N                     │ N                            │
   │                        ▼                       ▼                       ▼                              │
   │   ┌────────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐          │
   │   │ [T] qdb_delinquencysnapshot│  │ [T] qdb_collectionactivity│  │ [S] fax   [S] email      │          │
   │   │  append-only history       │  │  (custom ACTIVITY)        │  │  regardingobjectid → case│          │
   │   │  as-of · DPD · bucket ·    │  │  type · outcome · due ·   │  │  SMS/WhatsApp → fax      │          │
   │   │  balance · arrears · inst. │  │  status · owner · amount  │  │  Email → email           │          │
   │   │  batch id · source ts ·    │  │  PTP fields (date, amount,│  └──────────────────────────┘          │
   │   │  snapshot key (unique)     │  │  ptp status …)            │             ▲ 0..1                     │
   │   │  + ELIGIBILITY DECISION:   │  │                           │                                        │
   │   │  outcome · reason ·        │  │                           │                                        │
   │   │  ruleset code/version ·    │  │                           │                                        │
   │   │  evaluated-on              │  │                           │                                        │
   │   │  (case link OPTIONAL — a   │  │                           │                                        │
   │   │  GraceMonitor record has   │  │                           │                                        │
   │   │  history but no case)      │  │                           │                                        │
   │   └────────────────────────────┘  │  related record (fax/email)├─────────────┘ qdb_relatedrecordid     │
   │                                   └──────┬─────────────┬──────┘                                       │
   │                                          │ N           │ N                                            │
   │                                          │ 1           │ 1                                            │
   │                                          ▼             ▼                                              │
   │                  ┌───────────────────────────────┐ ┌───────────────────────────┐                      │
   │                  │ [C] qdb_collectionactivitytype│ │ [C] qdb_activityoutcome   │                      │
   │                  │  code · name EN/AR · category │ │  code · name EN/AR ·      │                      │
   │                  │  form code · process code ·   │◀┤  activity type · follow-up│                      │
   │                  │  rule code · approval · SLA   │1│  days · escalation · close│                      │
   │                  └───────────────────────────────┘N└───────────────────────────┘                      │
   │                                                                                                       │
   │  ┌────────────────────────────┐ 1     N ┌────────────────────────────┐    ┌───────────────────────────┐│
   │  │ [C] qdb_collectionstrategy │────────▶│ [C] qdb_strategyaction     │    │ [C] qdb_assignment-       ││
   └──│  customer type · product · │         │  sequence · activity type ·│    │      configuration        │┘
      │  DPD/arrears/(exposure)    │         │  channel · day offset ·    │    │  criteria → team/user ·   │
      │  risk · NPL · broken PTP · │         │  trigger · template ·      │    │  method · SLA · effective │
      │  legal/restructure status ·│         │  process/rule · stop-on-   │    │  (Smart Assignment ref:   │
      │  priority · effective dates│         │  payment/PTP · escalation  │    │   TBD — Requires QDB Conf)│
      └────────────────────────────┘         └─────────────┬──────────────┘    └───────────────────────────┘
                                                           │ N
                                                           │ 0..1
                                                           ▼
                                             ┌────────────────────────────┐
                                             │ [C] qdb_communicationtemplate│
                                             │  code · channel · language ·│
                                             │  subject · body · placeholders│
                                             │  approval · version · effective│
                                             │  (reuse EmailEditor? TBD)    │
                                             └────────────────────────────┘

   PLATFORM / INTEGRATION
   ┌────────────────────────────┐ 1     N ┌────────────────────────────┐   ┌────────────────────────────┐
   │ [P] qdb_platformconfiguration│───────▶│ [P] qdb_platformmapping    │   │ [P] qdb_identityexception  │
   │  platform type · org code ·│         │  business object ·         │   │  MIS customer id · facility│
   │  customer/facility entity ·│         │  canonical field ·         │   │  number · source · reason ·│
   │  case/activity entity ·    │         │  CRM entity · CRM field ·  │   │  status · batch/correlation│
   │  sms/whatsapp/email entity·│         │  type · required · access ·│   │  · received · reviewed by ·│
   │  document provider · MIS   │         │  source · active           │   │  resolution · resolved     │
   │  enabled/provider · flags  │         └────────────────────────────┘   │  customer (Customer lookup)│
   └────────────────────────────┘                                          └────────────────────────────┘
   ┌────────────────────────────┐   ┌────────────────────────────┐
   │ [S] qdb_crmlogs (ACTIVITY) │   │ [?] qdb_consent            │
   │  EXISTING — reuse (1,295    │   │  per customer per channel  │
   │  correlation · source ·    │   │  ONLY if QDB has no consent│
   │  operation · batch · status│   │  capability — TBD          │
   │  counts · error · timings  │   └────────────────────────────┘
   └────────────────────────────┘
```

## Relationship summary

| From | To | Cardinality | Column | Notes |
|---|---|---|---|---|
| qdb_collectioncase | contact **or** account | N:1 | `qdb_customerid` (Customer) | One column, two targets; HL populates contact, BFD account |
| qdb_collectioncase | \<facility entity\> | N:0..1 (**optional deployment extension**) | canonical: `qdb_facilitynumber` + `sourceSystem` (shared schema, always present). `qdb_facilityid` is an **optional per-deployment lookup** whose target is fixed metadata — an HL-targeted and a BFD-targeted `qdb_facilityid` are **two different physical relationships**, not one shared schema. No Collection logic branches on the physical entity name. | Lookup target fixed per org; business key always present |
| qdb_collectioncase | qdb_collectionstrategy | N:1 | `qdb_strategyid` | Current strategy |
| qdb_collectioncase | team | N:1 | `qdb_assignedteamid` | Plus `ownerid` (user/team) |
| qdb_delinquencysnapshot | qdb_collectioncase | N:**0..1** | `qdb_collectioncaseid` | Append-only; unique on `qdb_snapshotkey` (composition provisional — see *Snapshot idempotency* below). **Optional** — a `GraceMonitor`, `ExcludedSpecialHandling`, `IdentityException` or `FacilityException` record carries the eligibility decision and history **without any resolved CRM case, customer or facility** (ADR-DCP-11; gate correction 8). Source identifiers alone must be sufficient to persist and later reprocess the observation |
| qdb_collectionactivity | qdb_collectioncase | N:1 | `qdb_collectioncaseid` + `regardingobjectid` | Explicit lookup for filtering; regarding for Timeline |
| qdb_collectionactivity | qdb_collectionactivitytype | N:1 | `qdb_activitytypeid` | Replaces the option set |
| qdb_collectionactivity | qdb_activityoutcome | N:1 | `qdb_outcomeid` | Filtered by activity type |
| qdb_collectionactivity | fax / email | 0..1 | `qdb_relatedrecordtype` + `qdb_relatedrecordid` | Only when a business rule needs an activity per send (MP §40) |
| qdb_activityoutcome | qdb_collectionactivitytype | N:1 | `qdb_activitytypeid` | |
| qdb_strategyaction | qdb_collectionstrategy | N:1 | `qdb_strategyid` | Ordered by `qdb_sequence` |
| qdb_strategyaction | qdb_collectionactivitytype | N:1 | `qdb_activitytypeid` | |
| qdb_strategyaction | qdb_communicationtemplate | N:0..1 | `qdb_communicationtemplateid` | |
| qdb_platformmapping | qdb_platformconfiguration | N:1 | `qdb_platformconfigurationid` | |
| qdb_identityexception | contact **or** account | N:0..1 | `qdb_resolvedcustomerid` (Customer) | Set on resolution |
| fax / email | qdb_collectioncase | N:1 | `regardingobjectid` | Existing polymorphic regarding; case gets `HasActivities` |
| contact / account | — | — | `qdb_stopcontact`, `qdb_deceasedflag`, `qdb_dateofdeath`, `qdb_deceasedsource`, `qdb_vulnerabilityflag`, `qdb_specialhandling`, `qdb_collectionlanguage` | Customer-level Collection attributes (CP §7) |

## Deliberately absent (and why)

| Not modelled | Reason |
|---|---|
| `qdb_customer`, `qdb_facility` | MP §15–16, CP §6, §8 — existing masters |
| `qdb_communication` | MP §32 — fax / email |
| `qdb_ptprecord` | MP §26 — PTP is an activity type; no evidence of multi-child PTP |
| `qdb_auditlog` (business audit) | MP §52 — Dynamics **native audit** owns business field-change audit; technical/integration evidence goes to existing `qdb_crmlogs` and must not rebuild the broad `msst_dcpauditlog` pattern |
| `qdb_legalcase`, `qdb_insuranceclaim`, `qdb_restructurecase`, `qdb_dispute` (BRD FR-077..107) | MP §28–31 — activity types + Process Engine first; dedicated entities only with evidence |
| Elastic tables, Custom API as a hard dependency, Power Automate | ADR-DCP-04 §2 — both-platform feature set only |
| `qdb_integrationlog` (new) **and** `qdb_integrationlogs` (reuse) | both **withdrawn — superseded by reuse of existing `qdb_crmlogs`** (QDB decision, gate correction 1). See `QdbCrmLogsReuseAssessment.md`. |
| A second communication entity beside the existing `qdb_communication` | that entity is partner-bank correspondence; DCP creates none (MP §32) |

## Collection Eligibility — no entity added (ADR-DCP-11)

The eligibility/grace stage between resolution and case creation is a **Rule Engine ruleset**, referenced by
`qdb_platformconfiguration.qdb_eligibilityrulesetcode`, not a table. Its outcome
(`qdb_eligibility_outcome`: EligibleCreateCase · ExistingEpisodeUpdate · GraceMonitor ·
ExcludedSpecialHandling · IdentityException · FacilityException) is recorded on the snapshot. This keeps a
MIS record that yields no case fully auditable while adding no generic engine and no new entity.
`ExcludedSpecialHandling` may reuse the sandbox's existing `qdb_exclude_customer` — `TBD`.

## Cardinality rules the plugins enforce

- One **active** case per facility per delinquency episode (`qdb_facilitynumber` + active status) — CP §39.
- **Snapshot uniqueness / replay idempotency** — logical requirement, physical composition **not yet
  settled** (gate correction 2). See below.
- Case Delete blocked; snapshot Update/Delete blocked; completed activity Update/Delete blocked (carried over).

## Snapshot idempotency — logical requirement (physical key `TBD`)

**Requirement:** snapshot uniqueness and idempotency must be based on **stable Facility/Account identity**
plus **authoritative MIS observation/source identity**. Whatever composition is finally chosen, the
implementation **must guarantee replay idempotency** — re-running a batch, re-delivering a row, or
reprocessing after a failure must not create a second snapshot for the same observation.

**Candidate inputs** (final selection and order `TBD — Requires QDB/MIS Confirmation`):

| Candidate input | Column | Note |
|---|---|---|
| facility/account business identifier | `qdb_facilitynumber` | stable identity; always present |
| MIS financial as-of date | `qdb_snapshotdate` | balance/arrears observation date |
| DPD as-of date **where materially distinct** | `qdb_dpdasofdate` | HL extract shows DPD ≈ balance date + 16 days; semantics `TBD` |
| MIS source timestamp | `qdb_missourcetimestamp` | availability `TBD` |
| source record / version identifier | `TBD` | only if MIS exposes one |
| integration batch / run identifier | `qdb_integrationbatchid` | distinguishes runs, but alone it would make replay *non*-idempotent |

🔴 The earlier formula `facilityNumber | misAsOfDate | batchId` is a **candidate, not an approved final
key**. It is inconsistent with our own finding that DPD carries a different effective date from the
financial balance date, and `dpdAsOfDate` is itself `TBD`. Including `batchId` unconditionally would also
defeat replay idempotency, since a re-run produces a new batch id for the same observation.

`qdb_snapshotkey` is retained as the **alternate-key column**; its **composition is provisional and set at
provisioning time** (configuration), so the final rule can be applied without a schema change.
