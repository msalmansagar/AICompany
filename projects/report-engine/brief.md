# RPT-ENG-001 — Metadata-Driven Report Engine for Dynamics 365 CRM / Dataverse
**Status:** Phase 1 CEO APPROVED WITH CONDITIONS (2026-07-07) → GitHub Research → Architecture

## Key decisions locked at BRD gate
- **Middle tier: ALLOWED** (ASP.NET Core, on-prem and/or Azure) — owns heavy rendering, external connectors, async jobs, cache.
- **Execution: ASYNC/STAGED allowed** for heavy/external; interactive CRM reports synchronous.
- **V1 exports:** PDF + Excel + CSV + **Word + Image** (Word/PNG pulled into V1) + HTML/print (should).
- **SSRS parity:** functional parity for V1; pixel-perfect letters = later specialised track.
- **V1 = CRM-native sources only**, single-level drilldown; external sources + N:N + multi-level drill = V2/V3.
- 9 CEO conditions C-1…C-9 carried into architecture (see phase-1-ceo.md).

## One-liner
A configurable, metadata-driven Report Designer and execution engine delivered as a Dynamics CRM web resource, letting business power users and admins create, modify, publish, and run reports without developer involvement for most cases — replacing ~300 hand-built SSRS reports. Multi-source (CRM/FetchXML/QueryExpression/Web API/Custom API/SQL/REST/Core-Banking/MIS), configurable drilldown, filter/parameter/transformation engines, layout + export (PDF/Excel/Word/CSV/HTML/PNG), ribbon placement, security/governance, and a phased SSRS migration path. Must run on Dynamics 365 CRM on-prem 9.x and Dataverse cloud, with a future on-prem→cloud migration path.

## Business context
- ~300 reports currently built in SSRS; every new report or change needs a developer.
- ~90% of report data lives in CRM / Dataverse; the rest in Core Banking, MIS, APIs, SQL, middleware.
- Goal: eliminate developer dependency for the majority of report authoring and change requests.

## Scope headline (15 capability areas from the request)
1. Report Designer UI (full authoring surface + preview + versioning + clone + test-run)
2. 18 Dataverse configuration tables (definition, version, data source, entity mapping, columns, filters, parameters, relationships/drilldown, transformation, formula, layout, export setting, ribbon placement, security, execution log, audit log, external connector, cache)
3. Multi-source data layer (11 source types, combinable)
4. FetchXML limitation abstraction (FetchXML / QueryExpression / Web API / Custom API / pre-agg / staging)
5. Configurable multi-level drilldown + relationship engine (1:N, N:1, N:N, manual/external joins, hierarchy, sub-report, clickable rows)
6. Filter + parameter engine (typed inputs + full operator set + context tokens)
7. Transformation engine (rename/merge/split/lookup+optionset resolution/formatting/formula/pivot/JSON flatten/masking/null-handling/aggregation)
8. Layout + output designer (9 layout types + header/footer/branding/totals/formatting)
9. Export engine (PDF/Excel/Word/CSV/HTML/PNG/print) — on-prem + cloud library guidance
10. Ribbon/button placement + context passing
11. Security + governance (RBAC, owner/approver, draft/publish, versioning, masking, audit, exec history, source access control)
12. Runtime architecture (designer → config tables → exec API → plugin/custom-action → provider → transform → render → export → cache → connector → logging)
13. Technical stack (React/Fluent UI web resource; C# plugin/Custom Action on-prem, Custom API cloud; optional ASP.NET Core; export libs)
14. SSRS migration strategy (11 phases)
15. Deliverables (architecture, ERD, schema, component/exec-flow/provider/transform/export/security design, ribbon, plugin design, UI design, API contracts, sample JSON definition, sample queries, sample external merge, sample output, roadmap, effort estimate, risks, best practices)

## Hard constraints
- Not a viewer — a full configurable designer + execution engine for power users.
- Dynamics 365 CRM on-prem 9.x AND Dataverse cloud; future on-prem→cloud migration.
- Adhere to Maqsad AI clean-code standards and the tech constitution (deviation = ADR).

## Phases
- [x] Phase 2 — BA BRD (`phase-2-ba.md`) — 117 FR / 16 NFR / 11 BR / 12 OQ
- [x] Phase 1 — CEO BRD approval (`phase-1-ceo.md`) — APPROVED WITH CONDITIONS (9 conds)
- [x] GitHub Research (`dependencies.md`) — 8 libs adopted, engine = build
- [x] Phase 3 — Architecture — `phase-3-README.md` (index) + `phase-3-arch.md` (7 ADRs) + `phase-3-schema.md` (18 tables + ERD) + `phase-3-engines.md` + `phase-3-contracts-roadmap.md`
- [ ] Phase 4 — Technical build — **AWAITING CLIENT/CEO AUTHORIZATION** (recommend M0 spikes → M1 V1 core)
- [ ] Phase 5 — QA
- [ ] Phase 6 — Audit
- [ ] Phase 7 — CEO final decision

## Pre-build risks to clear (from arch skeptic review)
- On-prem plugin sandbox **outbound-URL allowlist** (silent failure blocking integration)
- On-prem 9.x **Annotation 5 MB attachment limit** (may cap large exports in V1)
- `IExternalConnector` **YAGNI** — defer to V2 (no V1 implementation)
- **M0 spikes required:** export-parity on-prem/cloud (C-7) + NCalc sandbox (C-5)
