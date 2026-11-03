# RPT-ENG-001 — Architecture Decision Record Index

| ADR | Title | Status | Date | Decided by |
|---|---|---|---|---|
| ADR-RPT-001 | Build metadata engine; adopt point libraries only | Accepted | 2026-07-07 | Architect |
| ADR-RPT-002 | ASP.NET Core middle-tier execution service (deviation from Node.js default) | Superseded by 011 | 2026-07-07 | Architect |
| ADR-RPT-003 | Async/staged execution with Dataverse-backed job queue | Accepted | 2026-07-07 | Architect |
| ADR-RPT-004 | IExportRenderer abstraction for on-prem/cloud export parity | Accepted | 2026-07-07 | Architect |
| ADR-RPT-005 | NCalc for sandboxed formula evaluation (C-5 compliance) | Accepted | 2026-07-07 | Architect |
| ADR-RPT-006 | Dual CRM entry point — Custom Action+Plugin (on-prem) vs Custom API (cloud) | Accepted | 2026-07-07 | Architect |
| ADR-RPT-007 | Role-keyed cache with post-retrieval masking | Accepted | 2026-07-07 | Architect |
| ADR-RPT-008 | Dashboard fan-out concurrency control and OBO query execution model | Accepted | 2026-07-19 | Architect |
| ADR-RPT-009 | PDF export library: PDFsharp/MigraDoc (supersedes QuestPDF) | Accepted | 2026-07-21 | Architect + QDB |
| ADR-RPT-010 | Middle-tier authentication: dual scheme, caller from validated credentials (closes B1) | Superseded by 011 | 2026-07-26 | Architect + user |
| ADR-RPT-011 | Execute in CRM: web resource + plugin, no hosted middle tier (supersedes 002; dissolves B1/B6) | Accepted | 2026-07-26 | User + Architect |
| ADR-RPT-012 | Multi-dataset result contract: dataset collection, single-dataset shape preserved verbatim (ADD-002 Phase A; reopens C-6) | Accepted | 2026-08-25 | Architect |
| ADR-RPT-013 | External dataset execution: registered endpoints, shared time budget, security declared per dataset (ADD-002 Phase B) | **Proposed** | 2026-08-25 | Architect |

Status values: Proposed | Accepted | Deprecated | Superseded
