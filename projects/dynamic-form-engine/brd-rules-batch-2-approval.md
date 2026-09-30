# DFE-RULES-002 — BRD approval

| Role | Decision | Date |
|---|---|---|
| CEO (user) | **APPROVED** — "BRD approved, start items 1, 2 and 7" | 2026-09-29 |

## Open questions carried into architecture

| Id | Resolution |
|---|---|
| OQ-001 on-prem parent fetch | Superseded. Architecture found the premise false; see phase-3-arch-rules-batch-2.md §2.2. |
| OQ-002 parent attribute picker | Recommendation taken: metadata-driven picker, scalar attributes only. |
| OQ-003 rating clear-selection | Recommendation taken: clicking the selected star clears it unless the field is required. |
| OQ-004 hidden grid columns | A column hidden **by a rule** is not validated. A column hidden in its own configuration is still validated, as today. |
| OQ-005 on-prem picklist option | Stands. The Rating option must be added by hand on-prem; the kit README will say so. |

## Scope held back pending a CEO answer

Item 2 (parent-record conditions) is **not built** until the CEO chooses which record "parent"
means. The approved BRD assumed a parent record id already reaches the form; it does not.
See phase-3-arch-rules-batch-2.md §2.2.
