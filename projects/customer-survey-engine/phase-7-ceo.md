# Phase 7 — CEO final decision brief

## Customer Survey Engine (CSE-ENG-001), release 1

| | |
|---|---|
| Date | 2026-11-14 |
| Prepared by | MSS Technologies (orchestrator) |
| For | The CEO, who decides |
| Status | **Decided 2026-11-14: approved with conditions** |
| Branch | `feat/survey-engine`, draft PR #173 |
| Release 1 scope | On-prem only: HL CRM (customers are contacts) and BFD CRM / QDB1 (customers are accounts), Dynamics CRM 9.1 |

## 1. What is delivered

- **The survey engine:** event and scheduled triggers, fatigue and duplicate rules, invitations, suppression logging, the four portal APIs, weighted scoring, the daily run and a health view (B0–B9). It was built, live-tested and verified on the cloud test org.
- **Form designer survey mode:** New Form asks Normal Form or Survey, and a survey shows only survey controls and settings. It is deployed to the cloud org and live-tested; there is a video.
- **The on-prem kit** (`onprem-deploy/2026-11-11/`):
  - the SurveyEngine package and the Form Engine update (designer 1.6.0);
  - a runbook with gates;
  - read-only console checks: preflight, stage 2, after-import;
  - the smoke test and the trigger speed test, both proven on the cloud org;
  - the scheduler.
- **Quality:**
  - C# branch coverage is 80.16% (419 tests), the on-prem checks have 127 tests, provisioning has 76, and the designer has 904.
  - Every change was code-reviewed.

## 2. Workflow gates

| Gate | Status | Evidence |
|---|---|---|
| BRD approved | Done | `phase-2-ceo-brd-decision.md` and addenda |
| Architecture approved | Done, with recorded amendments | `phase-3-ceo-arch-decision.md` |
| Build and code review | Done | PR #173 commits; review reports per change |
| QA (phase 5) | Done; two NFRs wait on the test orgs | `phase-5-qa.md` |
| Audit (phase 6) | Done: **Cleared with conditions** | `phase-6-audit.md` |
| CEO final (phase 7) | **This decision** | this document |
| Merge to main (A7) | Needs your approval | PR #173 |

## 3. Audit conditions and where they stand

| Item | Finding | Status | Who closes it |
|---|---|---|---|
| B8 | Scheduler needed System Administrator (SEC-01) | **Built**: Survey Scheduler role, cloud-verified, in the kit | QDB IT, at runbook stages 6 and 8.2 |
| B9 | No change history on survey tables (AUD-01) | **Built**: on for 7 tables, cloud-verified, in the kit | QDB IT, at checks P14 and Q13 |
| B1 / B2 | PDPPL classification, retention, written sign-off (CMP-01) | Decision pack sent for decision | QDB Compliance (`pdppl-decision-pack.md`, D1–D6, D9) |
| B3 | Anonymise leaves re-identifiers (CMP-02) | Waiting for Compliance (D7) | Compliance decides, then MSS builds |
| B7 | No retention or erasure beyond responses (CMP-03) | Waiting for Compliance (D3–D6, D8) | Compliance decides, then MSS builds |

**Not release-blocking:**
- Secure links stay off until the security review (B4, B5, SEC-02). The channel ships switched off.
- Survey clone drops scoring configuration (COD-01).
- No catch-up for a missed daily run (OPS-01, OPS-02).
- The portal account can write responses (AUD-03).
- There is no `phase-4-tech.md` (AUD-05).

## 4. Release gates that need the QDB test orgs

| Item | What closes it |
|---|---|
| A2: the Form Engine works without the Survey Engine | Runbook 2.5–2.7 and Gate 1b pass on HL test and QDB1 test |
| A3: trigger p95 under 10 s | Runbook 9.3 (`trigger-speed-test.ps1`) passes on both test orgs. On the cloud org it measured 14 s, then 10 s |
| Section C | The full runbook, on the test orgs first and then on production |

## 5. Risks if approved now

1. **Compliance may choose differently from MSS's recommendations.** If so, the engine changes before go-live (B3 and B7 builds). The pack minimises this by asking first.
2. **On-prem behaviour is unproven until the test orgs run the kit.** Two items are especially uncertain:
   - CRM 9.1 accepting the minimal scheduler role;
   - trigger speed on QDB's servers.

   The kit's checks detect both, and the runbook stops on a failure.
3. **The solution is unmanaged.** Rollback is a database backup (runbook stage 0.1, stage 10).

## 6. Options

| Option | Meaning |
|---|---|
| **A. Approve with conditions (MSS recommends)** | Release 1 is approved to proceed to the QDB test orgs and, once the conditions below are met, to production. Conditions: (1) QDB Compliance answers D1–D9 and MSS builds what they decide (B1–B3, B7); (2) A2, A3, B8 and B9 pass on HL test and QDB1 test; (3) the runbook passes on the test orgs before production (Gate 3); (4) PR #173 is reviewed and merged to main with your approval. |
| B. Hold | No release activity until Compliance has answered. The kit is not handed to QDB IT. |
| C. Reject | Stop the engagement. |

## 7. Decision

| | |
|---|---|
| Option chosen | **A. Approve with conditions** |
| Conditions added or removed | None; conditions (1)–(4) in section 6 stand |
| Merge PR #173 to main now? | Not decided in this answer; condition (4) needs a separate approval |
| Decided by | The user, as CEO, in chat ("Approve with conditions") |
| Date | 2026-11-14 |

---

# Addendum C — final decision (PDPPL retention, anonymise fix, erasure API)

BRD v1.4 (`phase-2-ba-addendum-pdppl-retention-erasure.md`, FR-CSE-076..082, NFR-CSE-011..014), built on
branch `feat/survey-pdppl-erasure`.

| Evidence | Result |
|---|---|
| Tests | C# 481, provisioning 88, on-prem checks 131, all pass; branch coverage 80.34% (`phase-5-qa.md` Addendum C) |
| Reviews | Code review and security review approved after fixes (SEC-001..003 fixed; SEC-004 and the business-unit role-name case accepted as R6, R7) |
| Live (org5869857f, 2026-11-15) | Provisioned and deployed, assembly matches the build; `e2e/erasure-e2e.mjs` 16/16, including R1 (several empty invitation links accepted); change history on the erasure log read back |
| QA | Pass with conditions C1–C5 |
| Audit | Cleared with conditions; CMP-02 and CMP-03 resolved in the build; AUD-C-01 fixed (change history on the erasure log); AUD-C-02 and CMP-C-01 go into the D9 sign-off (`pdppl-decisions.md`) |

| | |
|---|---|
| Option chosen | **Approve with conditions** |
| Conditions | Before production on HL CRM or QDB1: (1) the daily run and the erasure measured inside their time limits on the on-prem test orgs (QA C1, C2); (2) R1 confirmed on on-prem 9.1 before anonymise mode is used (C3); (3) runbook additions: erasure procedure, unpaired started row, periodic Q14 (C4); (4) Retention Days 730 and Mode Delete set per org (C5); (5) QDB Compliance's written sign-off (B2), covering D1–D9 and the audit decisions |
| Merge to main | Not decided in this answer; needs a separate approval |
| Decided by | The user, as CEO, in chat ("Approve with conditions") |
| Date | 2026-11-15 |

---

## Addendum D — final decision (2026-11-18)

Scope: BRD Addendum D + Amendment 1 (one-time general surveys sent now or at a date and time, to all active
customers or an audience copied from a CRM view; multi-number SMS; scheduler every 15 minutes), with the QA fix
QA-D1 ("My" views pinned to the copying administrator) and the audit fix AUD-D-01 (Run Started By).

| Evidence | Result |
|---|---|
| Tests | C# 616 (branch coverage ≥ 80 %), provisioning 98, on-prem checks 138, web resources 22, all pass |
| Reviews | Two code reviews (2026-11-16, 2026-11-17); all findings fixed |
| Live (org5869857f) | One-time E2E 15/15, dispatch incl. multi-number 11/11, daily run 12/12, view audiences 5/5; view picker checked in the browser |
| QA | Pass with conditions (`phase-5-qa.md` Addendum D); QA-D1 fixed |
| Audit | Cleared with conditions (`phase-6-audit.md` Addendum D); AUD-D-01 fixed; AUD-D-02 accepted by the CEO; AUD-D-03 with QDB Compliance |
| Kit | `onprem-deploy/2026-11-11/SurveyEngine_1_2_0_0_onprem_unmanaged.zip` `7fbcf872…`, assembly `e7281584…` identical to the cloud org |

| | |
|---|---|
| Option chosen | **Approve with conditions** |
| Conditions (before production, not before the merge) | (a) large-audience timing measured live (QA-D2); (b) on each QDB test org: preflight P15 reported, post-import Q15 PASS, the 15-minute task running cleanly, one run on HL's contact table (checklist C7, C7a); (c) QDB Compliance confirms the five BFD phone columns before SMS is switched on at BFD (AUD-D-03); (d) the CEO's browser test of the audience panel, including Send now's confirmation (QA-D3) |
| Merge to main | **Approved** — open the PR and merge |
| Decided by | The user, as CEO, in chat (three answers: "Approve with conditions", "Before production", "Open PR and merge") |
| Date | 2026-11-18 |
