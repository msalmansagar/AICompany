# DCP-001 — ADR Index

| ADR | Title | Status | Date | Decided by |
|-----|-------|--------|------|------------|
| ADR-DCP-01 | Collection interactions as custom activity entities | Accepted — Amended 2026-09-17 (second half superseded by ADR-DCP-08) | 2026-09-14 | architect, ceo |
| ADR-DCP-02 | Standalone Next.js portal + separate Fastify router, one monorepo | Superseded by ADR-DCP-07 and ADR-DCP-09 | 2026-09-14 / 2026-09-17 | architect, ceo |
| ADR-DCP-03 | Portal owns submission; Legal/Insurance lifecycle in native CRM | Superseded in part by ADR-DCP-07 (server-side enforcement rule survives) | 2026-09-14 / 2026-09-17 | architect, ceo |
| ADR-DCP-04 | Platform portability + pluggable auth adapter | Accepted — Confirmed and extended by ADR-DCP-10 | 2026-09-14 / 2026-09-17 | architect, ceo |
| ADR-DCP-05 | MIS ingest + thin immutable snapshot strategy | Accepted — Confirmed; extended by the two-path MIS design (`docs/MISIntegration.md`); **Amended 2026-09-17** — ADR-DCP-11 inserts the eligibility stage before case creation and the snapshot now carries the eligibility decision (case link optional) | 2026-09-14 / 2026-09-17 | architect, ceo |
| ADR-DCP-06 | PTP Kept/Broken evaluation against the latest MIS snapshot | Superseded — PTP is a `qdb_collectionactivity` type; evaluation retained as a rule | 2026-09-14 / 2026-09-17 | architect, ceo |
| ADR-DCP-07 | ONE React Collection Workspace as a full-page CRM web resource | Proposed (Phase 0, awaiting review) | 2026-09-17 | architect, ceo (pending) |
| ADR-DCP-08 | Communications through existing fax / email entities + one Communication Service | Proposed (Phase 0, awaiting review) | 2026-09-17 | architect, ceo (pending) |
| ADR-DCP-09 | Integration Service (Fastify) responsibilities after the web-resource decision | Proposed (Phase 0, awaiting review) | 2026-09-17 | architect, ceo (pending) |
| ADR-DCP-10 | Dual-platform (on-prem 9.1 + cloud) single-codebase architecture | Proposed (Phase 0, awaiting review) | 2026-09-17 | architect, ceo (pending) |
| ADR-DCP-11 | Collection Eligibility / Grace evaluation between MIS resolution and case creation | **Accepted** — approved at the Phase 1 gate; extended to strategy and Contact Hold by ADR-DCP-13 | 2026-09-17 | architect, ceo |
| ADR-DCP-12 | MIS determines financial cure; DCP owns the Collection lifecycle transition | Accepted (Phase 2 gate) | 2026-09-18 | user, architect |
| ADR-DCP-13 | Every configurable Collection decision goes through the Rule Engine facade, and fails closed | Accepted (Phase 3) | 2026-09-18 | user, architect |
| ADR-DCP-14 | Assignment configuration selects an engine; DCP builds no routing algorithm | Accepted (Phase 3) | 2026-09-18 | user, architect |
| ADR-DCP-15 | A Collection Case number has exactly two sources, and DCP invents no format | Accepted (Phase 3) | 2026-09-18 | user, architect |

Status values: Proposed | Accepted | Amended | Deprecated | Superseded (in part).
Superseded ADRs are never deleted (Master Prompt §84): original text is retained and a dated section names
the superseding decision. ADR-01/02/03 were promoted from the "Proposed" drafts in `../facts-and-analysis.md`
§9/§10/§11; ADR-04/05/06 were added in Phase 3; ADR-07..10 are the Phase 0 (2026-09-17) reconciliation
decisions governed by the QDB Master Prompt and Correction Prompt, pending the user's Phase 0 review.
**ADR-11** came out of the user's F1–F11 review the same day and amends ADR-05.
**ADR-12** is the Phase 2 gate decision on KI-46 (cure). **ADR-13–ADR-15** are the Phase 3 decisions on
the Rule Engine seam, assignment and case numbering; each was authorised by the user in the Phase 3 scope
and is backed by live sandbox evidence rather than intent.
