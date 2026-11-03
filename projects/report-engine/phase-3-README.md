# Phase 3 Architecture — Index & Reconciliation

**Engagement:** RPT-ENG-001 (report-engine) · **Date:** 2026-07-07 · **Status:** Architecture COMPLETE (pre-build)

The Phase 3 architecture is delivered across four documents:

| # | Document | Covers |
|---|---|---|
| 1 | `phase-3-arch.md` | System context, components, sync + async runtime, on-prem/cloud strategy, CRM entry points, ribbon, designer UI, security/governance, cross-cutting, **7 ADRs (ADR-RPT-001…007)**, tech stack, deployment, risks, skeptic review |
| 2 | `phase-3-schema.md` | Dataverse ERD + full schema for all **18 tables** (columns, types, option sets, relationships, alt keys) |
| 3 | `phase-3-engines.md` | Internal design of the data-provider/FetchXML-abstraction, drilldown, filter/param, transformation (NCalc), layout, and export engines |
| 4 | `phase-3-contracts-roadmap.md` | Execution API contracts, sample JSON report definition, sample FetchXML/QueryExpression, external-merge, output structure, roadmap, effort, risks, best practices |

## Canonical interface names (reconciles naming drift across docs 1 & 3)
The workstreams evolved slightly different names for the same seams. Canonical names for Phase 4:

| Concept | Canonical interface | Also written as |
|---|---|---|
| Per-source data reader | **`IReportDataProvider`** (+ `IReportDataProviderFactory`) | `IDataProvider` |
| Export renderer per format | **`IReportExporter`** (+ `IReportExporterFactory`) | `IExportRenderer` |
| Async job orchestration | **`IJobOrchestrator`** | — |
| Cache store | **`ICacheStore`** (Redis cloud / `qdb_reportcache` on-prem) | — |
| Secret store client | **`ISecretStoreClient`** (Key Vault / on-prem vault) | — |
| Dataverse connection | **`IDataverseConnectionFactory`** (on-prem + cloud impls) | — |
| Query mechanism routing | **`IQueryStrategySelector`** | — |
| Transformation step | **`ITransformation`** (+ `ITransformationPipeline`) | — |

## Skeptic challenges to resolve before Phase 4 (from doc 1's review + cross-doc)
1. **SC-01 YAGNI on `IExternalConnector`** — external connectors are V2+; do **not** define/ship the interface with zero implementations in V1 (constitution: no interface for a single/absent implementation). Introduce it in V2.
2. **SC-02 Ribbon generation in CI** — the RibbonDiff generator needs a seeded local fixture fallback so CI does not hard-depend on live Dataverse.
3. **SC-03 Export parity on-prem** — QuestPDF/ScottPlot font/GDI availability on on-prem hosts is unproven → **M0 export-parity spike (C-7)** must pass before committing V1 export scope.
4. **SC-04 NCalc sandbox** — confirm custom-function whitelist + no reflection/I/O in an **M0 spike (C-5)** before formulas ship.
5. **SC-05 Async job store** — Dataverse-backed job queue throughput under load; validate vs a dedicated queue (Service Bus) for cloud at scale (revisit in V2).
6. Remaining challenges 6–10 from `phase-3-arch.md` §Skeptic Review are carried into the Phase 4 build backlog.

## Open CEO conditions still outstanding (non-blocking for V1 architecture)
- **C-1 (OQ-003):** exact CRM on-prem 9.x build + network topology CRM↔middle-tier↔external.
- **C-2 (OQ-004):** data-residency + audit/execution-log retention (needed before external-data V2 + cache placement).

## Deliverables coverage (client's §15 request)
All requested design deliverables are produced: solution architecture (1), ERD (2), table schema (2), component design (1), execution flow (1), data-provider design (3), transformation design (3), export design (3), security model (1), ribbon design (1), plugin/custom-action design (1), web-resource UI design (1), API contracts (4), sample JSON definition (4), sample FetchXML/QueryExpression (4), sample external merge (4), sample output (4), roadmap (4), effort estimate (4), risks & mitigations (1+4), best practices (4).

## Next gate
Phase 3 (Architecture) is complete. The engagement's remaining phases — **Phase 4 build → Code review → QA → Audit → CEO final** — operate on built code. **Decision required from the client/CEO:** authorize Phase 4 build and scope the first milestone (recommended: **M0 Foundations + the two spikes**, then **M1 V1 core**). No code or live-org schema deployment has been performed (guardrail).
