# Customer Survey Engine — go-live checklist (CSE-ENG-001, B9 item 7)

| | |
|---|---|
| Date | 2026-11-12 |
| Build | B0–B9 complete on `feat/survey-engine` (not yet pushed or merged). Live and verified end to end on the cloud org `org5869857f`; on-prem kit `onprem-deploy/2026-11-11/` built, not yet imported |
| Targets | **Release 1: HL CRM and BFD CRM / QDB1 (on-prem 9.1) only** (CEO, 2026-11-12). The cloud org `org5869857f` stays the build-and-test org |
| Rule | A row marked **Release gate** must be **Done**, with the evidence named, before production on any org. Other rows gate only what their "Blocks" column says |

Status: **Open** (nothing done yet), **Partial**, **Done**. Every row names its source, so it can be traced
back to the decision that created it.

## A. Engagement gates (mandatory workflow)

| # | Gate | Blocks | Owner | Status | Source / evidence |
|---|---|---|---|---|---|
| A1 | **QA phase** (`phase-5-qa.md`): test strategy over the delivered build, including the unverified NFRs in A2–A4 | Release gate | QA (MSS) | Open | `new-project.md` sequence: Build → Code review → **QA** → Audit → CEO |
| A2 | NFR-CSE-004: SurveyEngine can be removed and every Form Engine form still publishes and renders | Release gate | QA | Open: never tested | `phase-2-ba.md` NFR table |
| A3 | NFR-CSE-006: async trigger p95 < 10 s; the daily run covers the whole customer base in one run | Release gate | QA | Open: not measured at volume (~450 customers, ~900 requests/month) | BRD section 9.2 |
| A4 | NFR-CSE-007: ≥ 80% branch coverage on survey code, from a coverage report | Release gate | QA | Partial: 221 C# and 37 + 59 JS tests pass; coverage never measured | — |
| A5 | **Audit phase** (`phase-6-audit.md`): governance, PDPPL alignment, audit trail | Release gate | Auditor (MSS) | Open | workflow |
| A6 | **CEO final decision** (`phase-7-ceo.md`) | Release gate | CEO | Open | workflow |
| A7 | Push `feat/survey-engine`, open the PR, code review of the B9 tooling, merge to main | Release gate | MSS + CEO (main merges need approval) | Partial: pushed 2026-11-13, draft PR #173 open; review and merge outstanding | PR #173 |
| A8 | The CEO acknowledges two departures from approved decisions: (a) on-prem ships **without** the pre-registered trigger steps (readiness F4; the approval said "steps for the 3 known sources ship pre-registered"), activation creates them instead; (b) **customer = account or contact per org** (F1) supersedes the B1 decision and BRD assumption A-01 | Release gate | CEO | **Done** 2026-11-12: both accepted | `phase-3-ceo-arch-decision.md` Amendments |

## B. Compliance and security

| # | Gate | Blocks | Owner | Status | Source / evidence |
|---|---|---|---|---|---|
| B1 | **Retention period and PDPPL classification** of survey responses; then set Retention Days + Mode in each org's Survey Settings | Release gate | QDB Compliance | Open | OQ-A1, NFR-CSE-008, C-4; config HL-12 / BFD-10 |
| B2 | **PDPPL sign-off** in writing | Release gate | QDB Compliance | Open | NFR-CSE-008, C-4 |
| B3 | An **anonymised** response keeps its link to the invitation, and the invitation names the customer, so it can be re-identified. Compliance decides: accept, or also clear the invitation's customer on anonymise (small plugin change) | Release gate (part of B2) | QDB Compliance | Open | found in B5; `phase-3-arch.md` decisions (B5) |
| B4 | **Secure-link security review**: threat model of the token path (generation, entropy, expiry, single use, guessing rate) | Switching secure links on, any org | Security engineer + QDB IT security | Open | NFR-CSE-009 |
| B5 | The portal team **rate-limits the token page** | Switching secure links on | QDB portal team | Open | architecture approval condition |
| B6 | **Cloud residency.** `org5869857f` is in the EMEA region (`crm4.dynamics.com`). A cloud org that holds production responses must be Qatar-resident, or the cloud target leaves release 1 | Production on the cloud org | CEO + QDB Compliance | **Done** 2026-11-12: release 1 is on-prem only; the cloud org holds no production responses | C-1 (amended), C-4 |

## C. On-prem deployment (each org: HL CRM, BFD CRM / QDB1; test first)

Every row is one runbook stage (`onprem-deploy/2026-11-11/RUNBOOK.md`). Track HL and QDB1 separately.

| # | Gate | Blocks | Owner | HL | QDB1 |
|---|---|---|---|---|---|
| C1 | Database backup before the window | the import | QDB DBA | Open | Open |
| C2 | Preflight report confirmed by MSS (gate 1); **P3 Custom APIs on 9.1** is the deciding check (readiness F2) | the import | QDB IT → MSS | Open | Open |
| C3 | Form Engine column patch + designer/runtime 1.5.0 imported (supersedes the 1.4.1 kit still awaiting import) | SurveyEngine import | QDB IT | Open | Open |
| C4 | **Grid-column census** (preflight P12) cleared, then the Form Engine DLL installed | weighted scoring on that org | Form owners + QDB IT | Open | Open |
| C5 | SurveyEngine imported; post-import report and render-cache comparison confirmed by MSS (gate 2) | configuration | QDB IT → MSS | Open | Open |
| C6 | Roles given: Survey Admin, Survey Analyst, Survey Integration (portal service account) | use | QDB IT | Open | Open |
| C7 | Daily scheduled task registered and its first run clean | scheduled surveys, postponed release, retention | QDB IT | Open | Open |
| C8 | Smoke test: read-only and `-WriteTest` pass on the test org (gate 3) | production | QDB IT → MSS | Open | Open |
| C9 | Steps C1–C8 repeated on production; smoke test read-only only | go-live | QDB IT | Open | Open |

## D. Per-org configuration answers (`onprem-deploy/2026-11-11/config/`)

| # | Gate | Blocks | Owner | Status |
|---|---|---|---|---|
| D1 | **HL request tables** and their customer, type, status and Digital/Legacy fields (HL-01, HL-02). None is known: HL is its own build | HL source rows | HL CRM administrator | Open |
| D2 | **Status and type values** that fire each survey, per org (HL-03, BFD-03, OQ-A2(b)) | activating each source | Business owner + CRM administrator | Open |
| D3 | **Applications Digital/Legacy field** (BFD-02; also unknown on the cloud org) | activating Applications | Business owner + CRM administrator | Open |
| D4 | Default language and customer language field, per org (HL-04/05, BFD-04/05, OQ-A2(c)) | settings row | Business owner + CRM administrator | Open |
| D5 | **"Active customer"** for the scheduled population "All active customers": the engine counts every active (statecode 0) account or contact. Confirm, or define it | scheduled triggers using that population | QDB business owner | Open |
| D6 | BFD source names confirmed on QDB1 (BFD-01; the preflight reads them) | BFD source rows | QDB1 CRM administrator | Open |

## E. Channels and the customer portal

| # | Gate | Blocks | Owner | Status | Source |
|---|---|---|---|---|---|
| E1 | The portal team builds the pending-survey popup, notification area and survey page on the four APIs | customers answering in the portal (the main channel) | QDB portal team | Open | FR-CSE-051..055; `docs/integration-guide.md` (delivered) |
| E2 | SMS hand-off answers: mobile field, HL `vrp_type` SMS value, required columns (HL-06, HL-07, BFD-06) | secure-link SMS | CRM administrator / SMS service owner | Open | OQ-A2(e) |
| E3 | **Does the SMS service need the activity's To party?** (HL-08, BFD-07). If yes, a small plugin change: the engine links the customer through Regarding today | secure-link SMS | SMS service owner → MSS | Open | config README |
| E4 | Sender queue per org, with an approved, enabled mailbox (HL-10, BFD-08) | secure-link email | QDB IT | Open | readiness F9 |
| E5 | Portal link-page URL per org (HL-11, BFD-09) | switching secure links on | QDB portal team | Open | OQ-A2(f) |

## F. Engine follow-ups (MSS)

| # | Item | Blocks | Status | Source |
|---|---|---|---|---|
| F1 | **"Survey health" view**: suppression reasons are covered (30-day view, Suppressions by Reason chart), but nothing shows **failed survey plugin and system jobs** | Release gate (approved scope) | Partial | architecture approval, "Scope addition"; `phase-3-arch.md` resolution 6 |
| F2 | Cloud: two Custom API parameter descriptions still say "account id" (should say account or contact) | nothing | Open | B9 item 3 |
| F3 | Cloud: the app still uses the platform icon (the on-prem kit already uses its own) | nothing | Open | readiness F10 |
| F4 | XSD check of the kit against Microsoft's 9.0.0.2090 schema (advisory; schemas not on the build machine) | nothing | Open | kit README |
| F5 | BRD text: assumption A-01 ("customers are accounts") and the B1 decision updated to the per-org customer table | nothing | **Done** 2026-11-12 | `phase-2-ba.md` A-01; `phase-3-arch.md` decisions (B9) |

## G. Cloud org — not a release 1 target (CEO, 2026-11-12)

Kept for a later release that adds a Qatar-resident cloud org. None of these gates release 1.

| # | Gate | Blocks | Owner | Status | Source |
|---|---|---|---|---|---|
| G1 | **Power Automate recurrence** calling `qdb_srv_RunDueSurveys` (steps in `scheduler/README.md`; needs a connection, so a person builds it) | scheduled surveys, postponed release, retention on cloud | QDB / CEO | Not in release 1 | C-2, B5 |
| G2 | Remove the end-to-end test data left on the org (test accounts, disbursements, setups, forms `srv-test-*`) | production on the cloud org | MSS (with go-ahead) | Not in release 1 (the org stays a test org) | B2–B8 test runs |
| G3 | Per-org configuration for the cloud org confirmed (it uses `provisioning/seed/org5869857f.json`) | activating cloud sources | Business owner | Not in release 1 | B1 |

## Summary

| | Release gates | Open | Partial | Done |
|---|---|---|---|---|
| A. Engagement | 8 | 6 | 1 | 1 |
| B. Compliance and security | 3 (B1–B3) | 5 | 0 | 1 |
| C. On-prem, per org | all, ×2 orgs | 9 × 2 | 0 | 0 |
| F. Engine | 1 (F1) | 3 | 1 | 1 |

**Next for MSS:** F1 (the health view), then A7 (push and PR) and the QA phase (A1–A4).
**Next for QDB:** the configuration answers (section D), Compliance (B1–B3), and running the runbook on the
two test orgs (section C).
