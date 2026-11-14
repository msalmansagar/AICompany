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
