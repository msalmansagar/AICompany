# SSRS Report Builder + CRM Report Wizard — capability analysis

**Source:** `SSRS-CRM-Report-Wizard-Canvas.pdf` (4 pages), provided 2026-09-01.
**Question asked:** "I want such functionality in the Report Engine — analyze and share feedback."
**Status:** analysis only. Anything below that changes the engine's contract needs a scope
addendum and the CEO gate before build (same route ADD-002 took).

---

## 1. What the PDF is

| Page | What it shows | What it represents |
|---|---|---|
| 1 | Microsoft Report Builder canvas, report `CreditProposalForCredit_Updated` | **The ceiling.** QDB's real Credit Proposal document: 16 datasets, banded A4 layout, expression cells, per-section totals |
| 2 | SSRS Dataset Properties | Each dataset = its own SQL query bound to a `@LoanId` parameter |
| 3 | SSRS "New Table or Matrix" wizard | Authored matrix: row groups / column groups / values, subtotals, stepped/blocked, expand-collapse |
| 4 | Classic Dynamics CRM Report Wizard (7 steps) | **The floor.** Guided authoring: entity + related type, saved-view filters, groupings, chart+table |

The 16 datasets on page 1: dsLoanapplicationDetails, dsProjectDetails, dsPricingRepaymentDetails,
dsSecurityDetails, dsSponsorDetails, dsProjectFinancialIndicator, dsFinancialProfile,
dsRiskAnalysisPortfolio, dsGuaranteeDetails, dsOtherSecurity, dsCreditRiskDetails,
dsConditionDetails, dsFinancialCovenants, dsNonFinancialCovenants, dsExposured, dsApprovalDetails.

One parent record (`@LoanId`), many unrelated child collections, each its own table or band —
**this is exactly the master-detail shape ADD-002 Phase A shipped.** The PDF is the strongest
validation yet of that contract.

## 2. Already covered (verified in code, 2026-09-01)

- **Guided wizard** mirrors the CRM wizard's 7 steps: name/description, entity + related,
  filters with groups, columns, layout, chart+table, review.
- **Saved-view reuse** — source type "CRM View" runs a saved view's query.
- **Multi-dataset** — root + standalone blocks, parent scoping via join keys, per-block row
  limit + enabled flag, per-block failure reasons, exports that carry every dataset or name
  what they omit. Single-record root renders as a **header of label/value fields** (the
  Applicant Profile band) — runtime, Preview tab and canvas.
- **Parameters** — `qdb_reportparameter` incl. lookup-target parameters, runtime prompt bar.
- **Grouped Report** with subtotals + grand total. Charts with drill-to-rows.
- Beyond both wizards: Arabic/RTL exports, access rules + owner exemption, per-run audit,
  versioning, dashboards.
- A **Matrix (Cross Tab) / Pivot layout exists but is heuristic** — it picks its own
  row/column categories from the data; it is not the SSRS authored contract.

## 3. Genuine gaps (ranked by what the Credit Proposal needs)

1. **Per-dataset queries and filters.** A block today = entity + columns + join keys. No
   per-block filters, no query payload — save validation *refuses* a query on a non-primary
   source because the engine would silently ignore it (MDS-FR-009). Every SSRS dataset
   carries its own parameterised query. Biggest contract gap.
2. **Parameter → dataset binding.** `@LoanId` feeds all 16 datasets. Today scoping is
   join-keys-to-the-root's-first-row. "Run for THIS record from its form" as an authored,
   first-class contract (parameter fills every dataset's query) is the missing half.
3. **Authored aggregates.** SSRS: explicit `Sum()` per column per block. Ours: heuristic
   first-numeric-column totals in some layouts — and Invoice/Master-Detail still print a
   **hardcoded Tax (10%)** on real data (open defect; this work forces the decision).
4. **True matrix** — authored row groups / column groups / values with aggregate choice,
   expand/collapse groups, stepped vs blocked, subtotal placement.
5. **Designable document canvas.** Canvas shows dataset blocks read-only (2026-08-31); the
   Credit Proposal needs authored bands per dataset — labels, fonts, order, label/value vs
   table per section. Design-time section→dataset binding is the missing piece; the canvas
   section model can carry it.
6. **Print page model** — A4 size, cm margins, repeating page header/footer, page numbers in
   PDF export.
7. Smaller: top/bottom N; "start from an existing report" (duplicate + overwrite);
   expression cells in header bands (the CEO/ICC/BOD/CB approving-authority matrix).

## 4. Flags before commitment

- **C-6 / scale.** 16 datasets run sequentially inside the 2-minute sandbox. Scoped to one
  loan each query is tiny; the risk is 16 *unscoped* 5,000-row datasets. C-6 was
  characterised for ONE capped query and must be re-measured for this shape (already a
  Phase B pre-condition — this reinforces it).
- **SQL does not port.** The SSRS queries use `CONVERT`, `DATEADD`, computed aliases.
  FetchXML cannot express all of it: some becomes formulas/transformations, some computed
  columns, some plugin-side. **Get the actual `.rdl` files** — dataset queries and layout are
  machine-readable in RDL, which sharpens the BRD and opens an RDL→definition migration
  tool as a differentiator.
- **Governance is the pitch.** Replacing Report Builder removes free-text SQL against the
  database. Every query becomes metadata: secured by the report's access rules, audited per
  run, versioned per save.

## 5. Recommended shape (for the BA phase, not decided here)

Phase the addendum (working name ADD-003) rather than swallow SSRS whole:

- **A — Document reports** (the Credit Proposal slice): per-dataset query/filters,
  parameter→dataset binding, authored per-block totals, kill the fabricated Tax(10%).
- **B — Document canvas + print model**: section→dataset design binding, band styling,
  A4/margins/page header-footer in PDF.
- **C — True matrix**: authored row/column groups + values, expand/collapse, stepped/blocked.

The wizard floor (page 4) is essentially parity already; fold any residue (top/bottom N,
start-from-existing) into A as small items.
