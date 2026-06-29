═══════════════════════════════════════════════════
DFE-STYLE-001 — OPEN QUESTION RESOLUTIONS (post-BRD checkpoint)
═══════════════════════════════════════════════════
Prepared by: Maqsad AI — 2026-06-28
Status: Inputs to Phase 3 Architecture. Resolves CEO conditions C-001 (OQ-008),
        C-006 (OQ-006) with data; sets product defaults for C-002 (OQ-002) and
        C-003 (OQ-009) pending QDB confirmation.

───────────────────────────────────────────────────
OQ-008 — Current Render Cache Size Per Form  [RESOLVED with measured data]
───────────────────────────────────────────────────
Source: live query against org5869857f (qdb_form_render_cache, status=Active).

- Column: qdb_runtime_json (Memo), stores Base64(gzip(form JSON)).
- Column MaxLength = 1,048,576 chars (1 MB).
- Measured across 10 active rows (5 forms × en/ar):

    form                       lang/v   col chars   decompressed JSON
    dfe-all-features           ar/v1    10,392      44,210 B
    dfe-all-features           en/v1     9,348      40,934 B
    loan-application           en/v1     5,044      21,807 B
    loan-application           ar/v1     5,044      21,807 B
    loan-application-legacy    en/v1     3,872      17,904 B
    loan-application-legacy    ar/v1     3,872      17,904 B
    feature-showcase           en/v1     3,316      12,704 B
    feature-showcase           ar/v1     3,316      12,704 B
    buy-house                  en/v1     2,940      10,063 B
    buy-house                  ar/v1     2,940      10,063 B

- Max column usage = 10,392 chars = 0.99% of the 1,048,576 limit.
- Headroom at the largest row ≈ 1,014 KB before the column limit.

CONCLUSION: There is no storage-limit risk. Adding the full DesignPayload to the
cache (even a generous per-field/section/button style payload on a 100-field form)
stays far under both the 512 KB NFR-004 cap and the 1 MB column limit. R-001
(High) is downgraded to Low. The architect may design DesignPayload INLINE in the
existing qdb_runtime_json cache JSON — no separate blob storage required.
NFR-004's 512 KB cap is retained as a defensive guard with a 400 KB designer warning.

───────────────────────────────────────────────────
OQ-006 — DesignerStyleModel Deprecation  [RESOLVED — in scope, internally owned]
───────────────────────────────────────────────────
Per CEO condition C-006: DesignerStyleModel is an internal Maqsad AI TypeScript
type; its deprecation is a Maqsad AI determination, NOT a QDB IT decision.

OWNER CORRECTION: Maqsad AI Project Manager + Architect (QDB IT Director removed).
DECISION: In scope and mandatory for this engagement (FR-099–101; CEO R-004).

Reference surface (grep of projects/dynamic-form-engine, node_modules excluded):
  Definition:
    designer/src/state/models/DesignerStyleModel.ts        (interface + DEFAULT_STYLE)
  Source consumers (8):
    designer/src/state/designerStore.ts                    (style state, updateStyle)
    designer/src/services/DesignService.ts                 (getTheme, mapRecordToStyleModel)
    designer/src/screens/ThemeEditorScreen.tsx
    designer/src/screens/PreviewScreen.tsx
    designer/src/screens/VersionHistoryScreen.tsx
    designer/src/screens/FormListScreen.tsx
    designer/src/screens/NewFormWizardScreen.tsx
  Tests (2):
    designer/tests/validation/publishValidation.test.ts    (DEFAULT_STYLE)
    designer/tests/state/storeSelectors.test.ts            (DesignerStyleModel, STUB_STYLE)

Migration target: shared DesignPayload / ThemeDefinition from @qdb/shared
(FR-100, FR-101). SM-008 verifies zero references remain at end of engagement.

───────────────────────────────────────────────────
OQ-002 / C-002 — Live Preview Scope  [DEFAULT SET — pending QDB confirmation]
───────────────────────────────────────────────────
DECISION (Maqsad AI product default): FR-023 live preview = CANVAS-ONLY. The
designer updates --qdb-* CSS custom properties on its own canvas / the existing
LivePreviewMiniature in real time. It is NOT a sandboxed iframe of the published
form. This matches the existing LivePreviewMiniature and avoids an unbounded
iframe-hosting task. To be confirmed in writing by QDB before UAT sign-off; low
risk of reversal.

───────────────────────────────────────────────────
OQ-009 / C-003 — WCAG Contrast Scope  [DEFAULT SET — pending QDB confirmation]
───────────────────────────────────────────────────
DECISION (Maqsad AI product default for v1):
  - BLOCKING (<3:1) / advisory (3:1–4.5:1) contrast checks cover PRIMARY PALETTE
    PAIRS + BUTTON colours (FR-025 pairs: primary/text-primary/text-secondary/
    error/success/warning vs background; button colour vs inferred text).
  - Per-field STATE styles (focusStyle, errorStyle, disabledStyle, placeholderStyle)
    are ADVISORY-ONLY in v1 (no publish block), because the background a field
    state renders against is not deterministically known at authoring time.
  - Extending blocking checks to state styles is deferred to a Tier 3 follow-on.
Rationale: keeps the WCAG implementation surface ~4× smaller without weakening
the core AA guarantee on text/background/button pairs. To be confirmed by QDB
Compliance; if they mandate state-style blocking, it is an additive change to
Group B/D, not a rework.

───────────────────────────────────────────────────
STILL OPEN (genuine QDB decisions; do not block architecture)
───────────────────────────────────────────────────
OQ-007 (font policy)  — blocks Phase 4 frontend build, not architecture.
OQ-010 (third-party WCAG audit as go-live gate) — blocks Phase 5 QA / Phase 7.
OQ-001/002(uc)/003/004/005 — Tier 3 / Brand Kit, already deferred.
