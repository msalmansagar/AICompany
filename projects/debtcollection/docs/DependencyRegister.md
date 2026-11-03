# DCP — Dependency Register (Phase 0)

**Status:** 2026-09-17. Status values: `Confirmed` (evidence in repo or org) · `Assumed` (reasonable,
unverified) · `TBD — Requires QDB Confirmation`.

## 1. External systems and QDB assets

| ID | Dependency | Needed for | Owner | Status | Evidence / note |
|---|---|---|---|---|---|
| D-01 | QDB MIS API (live + background) | Phases 4–5; every financial figure | QDB MIS | `TBD — Requires QDB Confirmation` | Only the Housing Loan Arrear workbooks exist (as-of 30/06/2026); contract proposal in `MISIntegration.md` |
| D-02 | HL facility/loan entity (logical name, business-id field) | Platform Mapping; target of the **optional** per-deployment `qdb_facilityid` extension (the canonical contract works without it) | QDB | `TBD — Requires QDB Confirmation` | 3C Merging workbook shows loan-balance columns on `account`, no facility entity name |
| D-03 | BFD facility/loan entity | as above | QDB | `TBD — Requires QDB Confirmation` | |
| D-04 | Existing Fax → SMS / WhatsApp mechanism (trigger, fields, delivery status) | Communication Service, Phase 7 | QDB | `TBD — Requires QDB Confirmation` | MP §32; CP §40 — not invented |
| D-05 | EmailEditor (`D:\QDB\Projects\EmailEditor`) | `qdb_communicationtemplate` reuse decision | QDB | `TBD — Requires QDB Confirmation` | Folder exists; capability for SMS/WhatsApp templates unknown |
| D-06 | Form Engine (DFE) | `IFormEngine` — activity forms | Internal (this repo) | Confirmed cloud; on-prem `Assumed` with open defects | Registration guide §3b documents Process-Action fallback; on-prem kit `onprem-deploy/2026-09-16` |
| D-07 | Process Engine (CWFD runtime: ApplyProcess / OnTaskComplete / TatAndEscalations) | `IProcessEngine` — approvals, SLA, escalation | Internal | Confirmed cloud; on-prem `TBD — Requires QDB Confirmation` | |
| D-08 | Rule Engine (EDP, 22 `qdb_edp_*` operations) | `IRuleEngine` — strategy, PTP, comms rules | Internal | Confirmed cloud; on-prem `Assumed` (runbook `deploy/onprem/ONPREM.md`, never run) | Same plugin code; Custom Action surface on-prem |
| D-09 | Report Engine | `IReportingService` | Internal | Confirmed cloud; on-prem `Assumed` | Requires `qdb_compositionmode` provisioned + two activities registered first |
| D-10 | Smart Assignment | `IAssignmentEngine` | QDB | `TBD — Requires QDB Confirmation` | No artefact in repo or `D:\QDB` |
| D-11 | Existing consent / opt-out capability | `qdb_consent` decision | QDB | `TBD — Requires QDB Confirmation` | |
| D-12 | On-prem 9.1 org for DCP (dev/test) | all on-prem runtime testing | QDB / user | `TBD — Requires QDB Confirmation` | None ever used for DCP; DFE uses Reyada-IPC |
| D-13 | Cloud sandbox org5869857f | current dev/test | user | Confirmed | Shared with EDP/CWFD/DFE; holds undeletable smoke data |
| D-14 | Entra ID app registrations (HL, BFD; Integration Service; browser SPA) | cloud auth | user / QDB | Confirmed for the sandbox SP; production `Assumed` | |
| D-15 | AD FS 2019 relying party / client for the Integration Service and SPA | on-prem auth | QDB | `TBD — Requires QDB Confirmation` | COND-008 unproven |
| D-16 | SharePoint (on-prem) / SharePoint Online | document provider | QDB | `Assumed` | via `qdb_platformconfiguration.qdb_documentprovider` |
| D-17 | Existing `qdb_*` columns on contact / account | avoid duplicate flags (CP §7) | QDB | `TBD — Requires QDB Confirmation` | 3C Merging schema lists 569 account fields; overlap check pending |
| D-18 | Account Status code meanings (7 / 8) and Exemption Amount sign | MIS normalisation | QDB MIS | `TBD — Requires QDB Confirmation` | seen in the detailed workbook |

## 2. Libraries and runtimes — kept

| ID | Library | Version | Licence | Use | Status |
|---|---|---|---|---|---|
| L-01 | panva/openid-client | 6.x | MIT | `AdfsAdapter` / `AzureAdAdapter` (OIDC discovery + client credentials) | Confirmed (in repo, 14 tests) |
| L-02 | timgit/pg-boss | latest | MIT | **background sync job state only** — never Collection data (CP §19) | Assumed (adopted in `dependencies.md`, not yet wired) |
| L-03 | harttle/liquidjs | latest | MIT | `{{placeholder}}` rendering for communication templates (MP §39) | Assumed |
| L-04 | recharts | 2.x | MIT | dashboard charts in the React workspace | Assumed |
| L-05 | Fluent UI (React) | 9.x | MIT | design system, matching DFE / Report Engine web resources | Assumed |
| L-06 | TanStack Query | 5.x | MIT | client cache, freshness, refetch on Refresh | Assumed |
| L-07 | react-hook-form + zod | current | MIT | **only** for forms the Form Engine does not own (e.g. platform admin screens) | Assumed |
| L-08 | zod | 3.x | MIT | boundary validation in services and config | Confirmed (in repo) |
| L-09 | Fastify + pino | 4.x / 9.x | MIT | Integration Service | Confirmed (in repo) |
| L-10 | Vitest, Playwright, Supertest | current | MIT | tests | Confirmed / Assumed (Playwright not yet added) |
| L-11 | Microsoft.CrmSdk.CoreAssemblies | 9.0.2.51, net471 | MS | plugins; on-prem-compatible SDK; ships `CreateCustomerRelationshipsRequest` | Confirmed |
| L-12 | Newtonsoft.Json | 13.0.3 | MIT | plugins (merge into the signed DLL for on-prem, as DFE/EDP do) | Confirmed |
| L-13 | xUnit + Moq | current | Apache 2 / BSD | plugin tests | Confirmed |
| L-14 | exceljs | 4.4.0 | MIT | **tooling only** — reading the MIS workbooks and generating `DebtCollection_Project_Tracker.xlsx`; never in a product bundle | Confirmed (present under `projects/dynamic-form-engine/node_modules`) |
| L-15 | Node.js | 24.x | MIT | tooling + Integration Service | Confirmed |
| L-16 | .NET SDK | 10.0.103 (builds net471 via reference assemblies) | MIT | plugin build | Confirmed |

## 3. Libraries — withdrawn or deferred by the Master Prompt

| Library | Previous decision | Now | Reason |
|---|---|---|---|
| nodemailer | ADOPT (email gateway) | **Withdrawn** | Email goes through the CRM `email` entity (MP §32) |
| `ISmsGateway` (build) | BUILD | **Withdrawn** | SMS/WhatsApp go through the CRM `fax` entity (MP §32) |
| puppeteer | ADOPT (PDF, RTL) | **Deferred to Report Engine** | MP §48–49 |
| Next.js / next-auth / next-intl | ADR-DCP-02 | **Withdrawn** | Full-page CRM web resource (MP §10–11); Next.js needs a Node server |
| Prisma / PostgreSQL as application store | never adopted | remains absent | all state in CRM; Postgres only if pg-boss is used, for job state |

## 4. Internal artefacts other work depends on

| Artefact | Depended on by | Status |
|---|---|---|
| `crm/plugins/Qdb.DebtCollection.Plugins/key.snk` (gitignored; path renamed in Phase 1) | rebuilding the registered assembly identity | Confirmed on disk only — back up |
| `crm/scripts/lib/*` provisioning library | Phase 1 `qdb_` provisioning (after auth abstraction) | Confirmed (Entra-only today) |
| `packages/dataverse-client`, `packages/types`, `packages/auth-adapters` | Integration Service; browser `ICrmAdapter` reuses `buildODataUrl`, `CrmApiError`, `retry`, `Result`, `DomainError` | Confirmed |
| `prototype/` (22 screens) | reference material for Phase 5 only | Confirmed — mock, not implementation |
| BRD `phase-2-ba.md` (136 FR + 20 NFR) | tracker traceability | Confirmed |
