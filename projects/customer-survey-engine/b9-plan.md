# B9 — Hardening, on-prem kits and hand-over (CSE-ENG-001)

| | |
|---|---|
| Started | 2026-11-11 |
| Covers | NFR-CSE-003, 006, 007, FR-CSE-055 (architecture section 15, B9) and Addendum A on-prem |
| State going in | B0–B8 and weighted scoring live on the cloud org `org5869857f`, each verified end to end |

## Why B9 exists

Everything so far was built and proven on the cloud org. QDB runs two on-prem CRM 9.1 orgs (HL and BFD/QDB1), which I cannot reach from here. B9 turns the cloud work into kits and instructions that QDB IT can install and verify on each on-prem org, and gives QDB's portal, backend and mobile teams what they need to build on the APIs.

## Work items, in order

| # | Item | Output | Needs from QDB |
|---|---|---|---|
| 1 | **Integration guide** for QDB portal, backend and mobile teams (FR-CSE-055): the four APIs with request/response examples, auth model, error codes, how to host the survey renderer for an invitation or link token, and the secure-link page flow | `docs/integration-guide.md` | — |
| 2 | **On-prem readiness review** of everything built: every Web API-only call, file/feature that 9.1 lacks, plugin sandbox limits, the Custom API on-prem binding | Findings list, fixes where needed | — |
| 3 | **On-prem kits** — one kit per release, shared by both orgs: the SurveyEngine solution (tables, roles, Custom APIs, views, charts, forms, app, icons), the `Qdb.SurveyEngine` assembly, and the Form Engine update (scoring columns, publisher, designer, runtime) | `onprem-deploy/<date>/` with a manifest and checksums | — |
| 4 | **Per-org configuration templates**: survey sources with each org's real field names and status values, settings, SMS hand-off (HL `letter` / BFD `fax`), sender queue, secure-link base URL | `onprem-deploy/<date>/config/HL.json`, `BFD.json` with every unknown marked TO-CONFIRM | OQ-A2 values per org |
| 5 | **Deployment runbook per org**: preflight checks, import order, Custom API ↔ plugin binding, safe regression gate, scheduler task, smoke test, rollback | `onprem-deploy/<date>/RUNBOOK.md` | A maintenance window |
| 6 | **On-prem smoke test** QDB IT can run (PowerShell, Windows auth): reads only, then one test invitation and response through the APIs | `onprem-deploy/<date>/smoke-test.ps1` | Run by QDB IT |
| 7 | **Go-live checklist**: the open gates (retention value, PDPPL sign-off, secure-link security review, "active customer" definition, per-org config) and who owns each | `go-live-checklist.md` | Owners' sign-off |

## Already known for the on-prem kits

- On-prem cannot use client-credentials auth; QDB IT imports the solution and runs the smoke test with Windows authentication.
- A solution exported from the cloud org must be down-levelled to 9.1 before import (Form Engine precedent, `dynamic-form-engine/onprem-deploy`).
- Custom APIs must be re-bound to the on-prem plugin types after import (Form Engine precedent).
- The regression gate uses the safe re-publish (`dynamic-form-engine/scripts/regression-gate/republish-safe.mjs` logic): never re-publish a form whose definition or child rows are ahead of its live version.
- The Form Engine runtime "Submit another" fix (`00ec1293`) is committed but not yet deployed to the cloud org; it ships in the kit either way.
