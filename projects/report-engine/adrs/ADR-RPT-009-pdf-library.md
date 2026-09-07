# ADR-RPT-009 — PDF export library: PDFsharp/MigraDoc (supersedes QuestPDF in ADR-RPT-001/dependencies §2)

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-21 |
| **Decided by** | Architect + client (QDB) direction |
| **Supersedes** | The "ADOPT QuestPDF" decision in `dependencies.md` Area 2 |

## Context

`dependencies.md` Area 2 adopted **QuestPDF** for PDF generation, flagging a license trap:
QuestPDF's Community license is free only for organizations under **~$1M USD annual revenue**;
above that a paid commercial license is required. The client, **Qatar Development Bank**, is a
national development bank whose revenue is well above that threshold, so the Community license is
not lawfully usable for this engagement, and using it would require a false eligibility attestation
(`QuestPDF.Settings.License = LicenseType.Community`).

## Decision

Adopt **PDFsharp/MigraDoc** (empira, package `PDFsharp-MigraDoc`, **MIT**) for PDF export.
MigraDoc provides a document-object model with native table support that maps cleanly onto a
tabular `ReportResult`; PDFsharp renders it to PDF with no runtime internet dependency, on Windows
and Linux. MIT licensing carries no revenue gate, so it is unconditionally usable by QDB.

QuestPDF remains a viable option **only** if the client later elects to purchase a commercial
license; this ADR does not preclude that, it removes the licensing blocker for shipping now.

## Consequences

- No per-organization license cost or attestation for PDF export.
- The `IReportExporter` abstraction is unchanged; only the PDF implementation differs.
- **Fonts:** PDFsharp's cross-platform build needs a font resolver. V1 uses a system-font resolver
  (Windows/Linux common paths). Bundling an embedded open font (e.g. Liberation/DejaVu) for fully
  self-contained cross-platform rendering is a hardening follow-up before Linux production deploy.
- The go-live checklist item "verify QuestPDF revenue tier / budget commercial license" is
  **removed** for the PDF path; it only re-applies if QuestPDF is reintroduced by client choice.
