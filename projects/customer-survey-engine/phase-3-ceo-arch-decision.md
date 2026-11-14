# CEO Architecture Decision — Customer Survey Engine (CSE-ENG-001)

| | |
|---|---|
| Decision | **APPROVED** |
| Decided by | The user, acting as CEO, in chat on 2026-11-09 |
| Architecture | `phase-3-arch.md` + `adr/ADR-001..007` |
| Estimate | 46–61 dev-days (B0–B9) |
| Next phase | Phase 4, technical build, starting with B0 (DFE prerequisites) |

## Approved with the Skeptic resolutions

All 8 Skeptic challenges are resolved. See the table at the end of `phase-3-arch.md`. The resolutions that change the plan:

- **Regression gate:** the baseline is captured before the B0 Save-defect fix, and the gate runs after it.
- **Plugin steps:** the steps for the 3 known sources ship pre-registered; dynamic registration applies only to sources added later.
- **Scope addition:** a "Survey health" view, built in B8.
- **Integration requirement:** QDB's portal team rate-limits the token page.
- **Digital/Legacy:** a flag exists on every request table. Only its field name per source is still to be confirmed.

## Gates still open (not blocking build)

- **OQ-A1:** retention value and PDPPL sign-off. Blocks release.
- **OQ-A2 (b, c, e, f):** status values, language field, SMS contract, portal tech. Blocks activation per org.
- **NFR-CSE-009:** the secure-link security review. Blocks enabling the link channel.

## Amendments

| Date | Amendment | Decided by |
|---|---|---|
| 2026-11-12 | **Plugin steps, on-prem.** The on-prem kit ships **without** the pre-registered steps for the 3 known sources: they name the cloud org's request tables, which the on-prem orgs do not have, so the import would fail (readiness F4). On-prem, activating a source creates its steps (`qdb_srv_ActivateSource`, proven in B4). The cloud org keeps its pre-registered steps. | The user, as CEO, in chat ("Yes, I accept both departures") |
| 2026-11-12 | **Customer table.** The customer is an **account or a contact, per org** (Survey Settings → Customer Table): accounts on the cloud org and BFD CRM / QDB1, contacts on HL CRM (readiness F1). This supersedes the B1 decision "Customer lookup = account" and BRD assumption A-01. Built and cloud-verified 2026-11-11 (`82629dd6`). | The user, as CEO, in chat |
| 2026-11-14 | **Scheduler privilege (audit SEC-01, checklist B8).** `qdb_srv_RunDueSurveys` accepts a dedicated **Survey Scheduler** role as well as System Administrator. The unattended scheduler account holds only Survey Scheduler. The role grants no survey or customer table rights, because the run's work already happens as SYSTEM; its only privilege is Read of the organization row, the platform minimum. This supersedes "System Administrator only" for this API (section 7, ADR-005); `qdb_srv_ActivateSource` / `DeactivateSource` stay System Administrator only. | The user, as CEO, in chat ("Dedicated scheduler role") |
