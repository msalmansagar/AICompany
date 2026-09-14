# DCP-001 — Phase 1 Priority Re-cut (PROPOSAL)

**Condition:** COND-DCP-001 — "Re-cut P1 into a genuinely shippable minimum."
**Date:** 2026-09-14
**Author:** BA — MSS Technologies
**Status:** COUNTERSIGNED by the Product Owner 2026-09-14 (T1 YES, T2 YES, T3 YES, all as recommended). Pending CEO sign-off.
The priorities inside `phase-2-ba.md` and `phase-2-ba-traceability.md` are **not changed** until both are given.

Baseline: 124 P1 / 12 P2 / 0 P3 functional requirements, 20 P1 non-functional.
Proposed: **73 P1 / 59 P2 / 4 P3** functional, 19 P1 / 1 P2 non-functional.
Of the 73 P1, six are zero-cost scope statements and thirteen are audit, immutability and
consent controls served by one generic plugin, so the two-person team's real build list is
**about 55 items**.

---

## 1. The cut rule

A requirement is **P1** if, and only if, at least one of these holds:

| Code | Rule |
|---|---|
| **SC-nn** | It is needed to satisfy success criterion SC-01..SC-06 (`phase-1-ceo.md` §6) for Housing Loan |
| **CTRL** | It is a hard control: R-03 append-only audit, R-04 stop-contact, PDPPL consent (FR-133..136), PII masking, or the R-01 identity foundation (QID as key) |
| **DEP** | A P1 item cannot function without it |
| **STMT** | A scope statement or constraint that costs nothing to honour |

Everything else is **P2** (valuable in Phase 1, but the six success criteria hold without it)
or **P3** (later phase, or only exercised when the BFD flag is on). Reason codes used below:

`SC-01..06` `CTRL` `DEP` `STMT` · `MOD8` restructuring deferred · `LEGAL` legal hand-off deferred
· `INS` insurance deferred · `DISP` disputes deferred · `PAY` needs the Payments feed (P2)
· `MIS-P2` portfolio MIS deferred · `ADM` portal admin screen deferred, CRM native forms suffice
· `BFD` BFD-only · `LATER` later phase · `NICE` valuable, not criterion-bearing

---

## 2. Full table

| ID | Now | Proposed | Reason |
|---|---|---|---|
| FR-001 | P1 | **P1** | SC-01 |
| FR-002 | P1 | **P1** | SC-01 |
| FR-003 | P1 | P2 | NICE — current snapshot + live value (FR-002/024) suffice; history grid later |
| FR-004 | P1 | **P1** | SC-01 — the Timeline is the officer's working surface |
| FR-005 | P1 | P2 | LEGAL/INS — deceased state is shown via the stop-contact banner (FR-095/096) |
| FR-006 | P1 | P2 | NICE — open PTPs are listed on the case (FR-055); restructure/dispute lists follow their modules |
| FR-007 | P1 | **P1** | CTRL — QID as the identity key (R-01 foundation) |
| FR-008 | P1 | P2 | R-06 — a CRM view of missing-QID records covers Phase 1; queue UI later |
| FR-009 | P2 | P3 | BFD |
| FR-010 | P1 | P2 | NICE — FR-027 alert and FR-126 panel already surface ingest state |
| FR-011 | P1 | P2 | PAY |
| FR-012 | P1 | **P1** | SC-03 — the evidence that a send happened or was blocked |
| FR-013 | P1 | P2 | DISP |
| FR-014 | P1 | **P1** | CTRL — PDPPL masking |
| FR-015 | P1 | P2 | NICE — colour coding |
| FR-016 | P1 | **P1** | DEP — the MIS ingest feeds everything |
| FR-017 | P1 | **P1** | DEP — snapshot fields |
| FR-018 | P1 | **P1** | DEP — the ten-bucket taxonomy |
| FR-019 | P1 | **P1** | SC-01 — manual case creation |
| FR-020 | P1 | **P1** | DEP — product type on the case |
| FR-021 | P2 | P3 | LATER — contradicts the manual-creation decision (D-2) until proven needed |
| FR-022 | P1 | **P1** | DEP — statuscodes |
| FR-023 | P1 | **P1** | CTRL — transition matrix in a plugin |
| FR-024 | P1 | P2 | NICE — value-at-decision is *stored* by FR-017; the side-by-side display can follow |
| FR-025 | P1 | **P1** | CTRL — no deletion |
| FR-026 | P1 | P2 | NICE — visual segregation; the *control* is FR-033 |
| FR-027 | P1 | **P1** | DEP — NFR-014 silent-outage rule |
| FR-028 | P1 | **P1** | STMT — audit columns are free |
| FR-029 | P2 | P2 | NICE |
| FR-030 | P2 | P3 | BFD |
| FR-031 | P1 | **P1** | DEP — strategy table read |
| FR-032 | P1 | **P1** | DEP — strategy table shape |
| FR-033 | P1 | **P1** | CTRL — "no automated contact" rule (COND-DCP-004) |
| FR-034 | P1 | **P1** | STMT — no exposure segmentation |
| FR-035 | P1 | **P1** | DEP — rules editable without deployment; delivered on CRM native forms, not a portal screen |
| FR-036 | P1 | **P1** | CTRL — rule audit, same generic plugin as FR-118 |
| FR-037 | P1 | **P1** | SC-05 — **three queues in Phase 1** (Early Collection, High Risk, Deceased & Insurance); Legal Review, Restructuring, Disputes arrive with their modules |
| FR-038 | P1 | **P1** | DEP — strategy → queue assignment is the engine (D-4) |
| FR-039 | P1 | P2 | NICE — manual reassignment with reason is captured by the generic audit; the approval threshold follows |
| FR-040 | P1 | **P1** | SC-05 — SLA status |
| FR-041 | P1 | **P1** | SC-05 |
| FR-042 | P2 | P2 | NICE |
| FR-043 | P1 | **P1** | CTRL — stop-contact cases cannot sit in a contact queue |
| FR-044 | P2 | P2 | NICE |
| FR-045 | P1 | **P1** | SC-01 |
| FR-046 | P1 | **P1** | SC-01 |
| FR-047 | P1 | **P1** | CTRL — completed actions immutable |
| FR-048 | P1 | **P1** | SC-05 — overdue actions |
| FR-049 | P1 | P2 | NICE — escalation as a Supervisor Review action; broken-PTP escalation (FR-058) is the SC-02 path |
| FR-050 | P2 | P2 | NICE |
| FR-051 | P1 | P2 | NICE — pairs with FR-049 |
| FR-052 | P1 | **P1** | DEP — outcome codes from config (NFR-018) |
| FR-053 | P1 | **P1** | STMT — actor/timestamp are free |
| FR-054 | P1 | P2 | NICE — one option value; add the day a visit is logged |
| FR-055 | P1 | **P1** | SC-01 |
| FR-056 | P1 | **P1** | SC-02 — and the first real exercise of stop-contact + consent on an automated send |
| FR-057 | P1 | **P1** | SC-02 |
| FR-058 | P1 | **P1** | SC-02 |
| FR-059 | P1 | **P1** | DEP — PTP statuses |
| FR-060 | P1 | P2 | NICE — reschedule reason is captured by FR-061; the limit/approval follows |
| FR-061 | P1 | **P1** | CTRL — PTP audit |
| FR-062 | P2 | P2 | PAY — see trade-off T3 for how "kept" is detected without it |
| FR-063 | P1 | P2 | NICE — FR-129 already carries kept rate per officer |
| FR-064 | P1 | **P1** | CTRL — stop-contact on the reminder |
| FR-065 | P1 | **P1** | SC-02/03 — **SMS, Email and Call log in Phase 1**; Official Letter channel is P2 (dispatch lifecycle, Q-11) |
| FR-066 | P1 | **P1** | CTRL — one authoritative communication record |
| FR-067 | P1 | **P1** | SC-03 |
| FR-068 | P1 | **P1** | SC-03 |
| FR-069 | P1 | **P1** | CTRL — approved templates only (conduct) |
| FR-070 | P1 | **P1** | DEP — Arabic/English templates (Qatar) |
| FR-071 | P1 | P2 | ADM — Phase 1 templates are seeded pre-approved by Compliance offline; the in-system approval workflow follows |
| FR-072 | P1 | P2 | NICE — gateway acceptance is logged in Phase 1; delivered/opened status follows |
| FR-073 | P1 | **P1** | SC-01 — call logging |
| FR-074 | P2 | P2 | NICE |
| FR-075 | P1 | **P1** | CTRL — completed communications immutable |
| FR-076 | P1 | **P1** | CTRL — template audit, generic plugin |
| FR-133 | P1 | **P1** | CTRL — consent record |
| FR-134 | P1 | **P1** | CTRL — fail closed |
| FR-135 | P1 | **P1** | CTRL — withdrawal immediate |
| FR-136 | P1 | **P1** | CTRL — WhatsApp inherits SMS gate (Q-12) |
| FR-077 | P1 | P2 | MOD8 |
| FR-078 | P1 | P2 | MOD8 |
| FR-079 | P1 | P2 | MOD8 |
| FR-080 | P1 | P2 | MOD8 |
| FR-081 | P1 | P2 | MOD8 |
| FR-082 | P2 | P2 | MOD8 |
| FR-083 | P1 | P2 | MOD8 |
| FR-084 | P1 | P2 | MOD8 |
| FR-085 | P1 | P2 | MOD8 |
| FR-086 | P1 | P2 | MOD8 |
| FR-087 | P1 | P2 | LEGAL |
| FR-088 | P1 | P2 | LEGAL |
| FR-089 | P1 | P2 | LEGAL |
| FR-090 | P1 | P2 | LEGAL |
| FR-091 | P1 | **P1** | STMT — Legal User stays in native CRM (ADR-DCP-03) |
| FR-092 | P1 | P2 | LEGAL |
| FR-093 | P1 | P2 | LEGAL |
| FR-094 | P1 | P2 | LEGAL |
| FR-095 | P1 | **P1** | CTRL — the deceased flag is the R-04 trigger |
| FR-096 | P1 | **P1** | SC-03 |
| FR-097 | P1 | **P1** | CTRL — pairs with FR-043 |
| FR-098 | P1 | P2 | INS |
| FR-099 | P1 | P2 | INS |
| FR-100 | P1 | P2 | INS — with stop-contact on, heir contact is manual and logged; the approval step follows |
| FR-101 | P1 | P2 | INS |
| FR-102 | P1 | **P1** | STMT — Insurance Officer stays in native CRM |
| FR-103 | P1 | P2 | DISP |
| FR-104 | P1 | P2 | DISP |
| FR-105 | P1 | P2 | DISP |
| FR-106 | P1 | P2 | DISP |
| FR-107 | P1 | P2 | DISP |
| FR-108 | P1 | **P1** | CTRL — audit log plugin |
| FR-109 | P1 | **P1** | CTRL — audit fields |
| FR-110 | P1 | **P1** | CTRL — audit immutable |
| FR-111 | P1 | **P1** | SC-04 |
| FR-112 | P1 | **P1** | DEP — single role matrix; the cross-org **drift report is P3 (BFD)** |
| FR-113 | P1 | **P1** | DEP — standard roles |
| FR-114 | P1 | **P1** | CTRL — masking enforced server-side |
| FR-115 | P1 | P2 | NICE — login/logout come from AD FS and CRM audit natively |
| FR-116 | P1 | P2 | ADM — configuration is edited on CRM native forms in Phase 1 |
| FR-117 | P1 | P2 | ADM — pairs with FR-071 |
| FR-118 | P1 | **P1** | CTRL — config audit, generic plugin |
| FR-119 | P1 | **P1** | SC-06 |
| FR-120 | P1 | **P1** | SC-03 |
| FR-121 | P1 | **P1** | DEP — MIS Middleware API |
| FR-122 | P1 | **P1** | DEP — SMS/Email gateway |
| FR-123 | P2 | P2 | PAY |
| FR-124 | P2 | P3 | LATER — QCB file is a regulatory deliverable, not workspace scope |
| FR-125 | P1 | P2 | MIS-P2 — outbound extract to the warehouse |
| FR-126 | P1 | **P1** | DEP — NFR-019 go-live requirement; a status table, not a console |
| FR-127 | P1 | **P1** | SC-05 |
| FR-128 | P1 | P2 | MIS-P2 — portfolio dashboard from MIS |
| FR-129 | P1 | **P1** | SC-05 |
| FR-130 | P1 | P2 | LEGAL |
| FR-131 | P1 | P2 | MIS-P2 |
| FR-132 | P1 | P2 | NICE — pairs with FR-026 |
| NFR-001..003 | P1 | **P1** | constraints |
| NFR-004 | P1 | P2 | ops policy, not a build item |
| NFR-005..012 | P1 | **P1** | constraints (NFR-005 MSAL reads "pluggable auth adapter" per NFR-020) |
| NFR-013 | P1 | **P1** | Arabic/English **communications**; portal RTL layout is P2 (internal users) |
| NFR-014..020 | P1 | **P1** | constraints |

---

## 3. Module summary and critical path

| Module | P1 before | P1 after | What remains P1 |
|---|---:|---:|---|
| 1 Customer & Loan 360 | 14 | 6 | profile, facilities, timeline, QID key, comms log, masking |
| 2 Delinquency & Case | 12 | 10 | MIS ingest, snapshot, manual case, statuscodes + plugin, no-delete, ingest alert |
| 3–4 Strategy & Queues | 12 | 11 | strategy table + engine, three queues, SLA, supervisor view, stop-contact queue rule |
| 5–6 Actions & PTP | 18 | 13 | log action, immutable, overdue, outcome codes, PTP create/monitor/break/escalate, PTP audit |
| 7 Communication | 15 | 13 | SMS/Email/Call, router gate, templates AR/EN, immutable, consent FR-133..136 |
| 8 Restructuring | 9 | 0 | — (T1) |
| 9 Legal | 8 | 1 | scope statement only (T2) |
| 10 & 12 Deceased, Insurance, Disputes | 13 | 4 | deceased flag, stop-contact suppression, queue move, scope statement (T2) |
| 13–15 Audit, Admin, Integration, Dashboards | 23 | 15 | audit plugin + evidence pack, roles + masking, router, MIS + gateway, health panel, Operational + PTP dashboards (T3) |
| **Total** | **124** | **73** | |

**Critical path in build order** (each step is usable on its own):

1. **Foundation** — FR-007, 028, 108–110, 118, 112–114: QID key, generic audit plugin, roles, masking.
2. **Ingest** — FR-121, 016–018, 027, 126: MIS API → snapshot → alert + health panel.
3. **Case** — FR-019, 020, 022, 023, 025: manual case, statuscodes, transition plugin.
4. **Router + stop-contact + consent** — FR-119, 120, 067, 068, 095–097, 043, 133–136: the R-04 control, testable before any channel exists.
5. **Workspace** — FR-001, 002, 004, 012, 045–048, 052, 053: Customer 360, timeline, action logging. *SC-01 provable here.*
6. **PTP** — FR-055, 057–059, 061, 064: create, monitor, break, escalate. *SC-02 provable (reminder needs step 7).*
7. **Communication** — FR-122, 065, 066, 069, 070, 073, 075, 076, 056: gateway, templates, reminder. *SC-03 provable.*
8. **Strategy + queues** — FR-031–038, 040: config table drives queue assignment + SLA.
9. **Supervision + evidence** — FR-041, 111, 127, 129: supervisor view, evidence pack, two dashboards. *SC-04, SC-05 provable.*
10. **BFD flag** — NFR-012 on top of FR-119: *SC-06 provable with an empty BFD target.*

---

## 4. Three trade-offs for the Product Owner

**T1 — Restructuring / Workout (Module 8) entirely P2. Recommended: YES.**
Ten requirements, a five-stage approval chain, a document checklist and a financial assessment,
none of which any success criterion needs. In Phase 1 an officer records "restructure requested"
as a case status (FR-022) and an action (FR-045); the proposal and its approvals arrive as the
first P2 increment. If NO: Module 8 returns to P1 and the P1 count becomes 82.

**T2 — Legal referral, Insurance claims and Disputes (Modules 9, 10-insurance, 12) P2. Recommended: YES.**
Legal Users and Insurance Officers already work in native CRM (ADR-DCP-03), so the portal side
is a hand-off form and a read-only status view. The deceased flag, stop-contact suppression and
the Deceased & Insurance queue **stay P1** because they are the R-04 control. Disputes are
recorded as an action with the case set to Pending Customer Response until the dispute entity
lands. If NO to any one of the three: +8 (legal), +4 (insurance) or +5 (disputes) P1 items.

**T3 — Phase 1 integrations are MIS API + SMS/Email gateway only; the portal Admin screen and the
Portfolio, Management and Legal dashboards are P2. Recommended: YES.**
Consequences to accept explicitly: (a) configuration (strategy rules, templates, thresholds) is
edited on CRM native forms, with the same audit plugin; (b) dashboards are the Operational and
PTP dashboards from live Housing Loan data; portfolio views from MIS follow; (c) **without the
Payments feed, a PTP is marked Kept when the next MIS ingest shows arrears reduced by at least
the promised amount, or manually by the officer with a reason** — SC-02 ("no matched payment")
is satisfied through the MIS snapshot, not a payment event. If NO: FR-116/117/128/131 return to
P1 and the Payments integration (FR-123, 062, 011) becomes a Phase 1 external dependency.

---

## 5. Product Owner countersignature

| Trade-off | Decision | Date |
|---|---|---|
| T1 Restructuring / Workout entirely P2 | **YES** | 2026-09-14 |
| T2 Legal, Insurance and Disputes portal work P2 | **YES** | 2026-09-14 |
| T3 MIS + gateway only; admin screen and portfolio dashboards P2; PTP Kept from MIS drop or manual mark | **YES** | 2026-09-14 |

## 6. Closing note

The Product Owner has countersigned T1–T3. Nothing changes until the CEO signs off; only then are the priorities applied to `phase-2-ba.md` and the traceability matrix,
COND-DCP-001 closed in `projects/state.yml`, and Phase 3 (Architecture) opened.

---

## 7. CEO sign-off

**Decision: SIGNED OFF WITH NOTES.** COND-DCP-001 is satisfied. The 73 P1 / 59 P2 / 4 P3
cut (about 55 real build items) is a genuinely shippable minimum: §3 gives a build-ordered
critical path where each step stands alone and every success criterion is provable from P1.
The three trade-offs are countersigned by the Product Owner (§5). Verified:

- **(a) SC-01..SC-06 all satisfiable from P1 alone.** SC-02 (FR-056/057/058), SC-03
  (FR-067/068/096/120), SC-04 (FR-111 + FR-108/109/110), SC-05 (FR-041/127/129), SC-06
  (NFR-012/FR-119) — every mapped FR stays P1. SC-01 holds on FR-001+FR-002+FR-045/046/055.
- **(b) No hard control demoted.** R-03 audit chain (025/047/061/075/076/108/109/110/017/
  036/118), R-04 stop-contact chain (033/043/064/067/068/095/096/097/120), PDPPL consent
  FR-133..136, masking FR-014/114, QID key FR-007, and NFR-008/009/010 all retained P1.
- **(c) T3 acceptable against SC-02.** SC-02 governs the broken path (FR-057/058, both P1)
  and does not mandate a Payments-event source; the MIS arrears-drop or manual officer mark
  is a valid "matched payment" signal.

**Notes (carry into Phase 3, not blockers):**
1. When priorities are applied, regenerate `phase-2-ba-traceability.md`: the SC-01 row still
   lists FR-003 (now P2) as a mapped FR. State explicitly that FR-001+FR-002 carry the "full
   facility view"; FR-003 (snapshot provenance) and FR-024 (side-by-side display) follow as P2.
2. MIS ingest is batch: a payment made near the promised date may not reduce arrears until the
   next ingest, risking a false "Broken" flag and escalation. Architecture must evaluate broken
   against the latest snapshot and make the manual "Kept" mark the correction path.
3. FR-136 still carries an unresolved `[NEEDS CLARIFICATION: Q-12]` (WhatsApp, out of Phase 1).
   It stays P1 only as a fail-closed inherit-SMS-gate statement; no WhatsApp build in Phase 1.

**Condition COND-DCP-001 is CLOSED. Phase 3 (Architecture) may open** once the remaining
Phase-3 gating conditions (COND-DCP-002/003/005/006/007) stand closed as logged in phase-2-ba.md.

| Sign-off | Authority | Date |
|---|---|---|
| Priority re-cut (73/59/4) countersigned | CEO — MSS Technologies | 2026-09-14 |
