# DFE-RULES-002 — BRD approval

| Role | Decision | Date |
|---|---|---|
| CEO (user) | **APPROVED** — "BRD approved, start items 1, 2 and 7" | 2026-09-29 |

## Open questions carried into architecture

| Id | Resolution |
|---|---|
| OQ-001 on-prem parent fetch | Superseded. Architecture found the premise false; see phase-3-arch-rules-batch-2.md §2.2. |
| OQ-002 parent attribute picker | Recommendation taken: metadata-driven picker, scalar attributes only. |
| OQ-003 rating clear-selection | A "Clear" button beside the stars empties an optional rating; a required one has none. Fluent's Rating does not report a click on the already-selected star, so the BRD's click-to-clear was not possible. |
| OQ-004 hidden grid columns | A column hidden **by a rule** is not validated. A column hidden in its own configuration is still validated, as today. |
| OQ-005 on-prem picklist option | Stands. The Rating option must be added by hand on-prem; the kit README will say so. |

## Item 2 scope decision

CEO, 2026-09-30: "parent record" means **the record selected in a lookup on the form**.
See phase-3-arch-rules-batch-2.md §2.2.
