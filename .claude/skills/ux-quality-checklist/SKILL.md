---
name: ux-quality-checklist
description: Use when designing, building, or reviewing any UI — pages, components, forms, portals. A priority-ranked quality bar; work top-down, the top items are non-negotiable.
---

# UX Quality Checklist

Adapted from nextlevelbuilder/ui-ux-pro-max for MSS Technologies. A ranked bar for
the `ui-ux-designer` (when specifying), the `frontend` agent (when building), and
`code-reviewer` (when reviewing UI). Work 1→10; 1–3 are non-negotiable.

| # | Category | Must have | Avoid |
|---|---|---|---|
| 1 | **Accessibility** | Contrast 4.5:1 (3:1 large/UI); alt text; keyboard-operable with visible focus; labels programmatically tied to controls; colour never the sole meaning | Removing focus rings; icon-only buttons without a label |
| 2 | **Bilingual / RTL** (MSS) | Layout mirrors for Arabic; direction-icons flip, meaning-icons don't; every string in EN + AR; numerals/dates/currency per locale | English-only layouts that break on Arabic expansion; per-case RTL improvisation |
| 3 | **Touch & interaction** | Targets ≥44×44px, ≥8px apart; loading/pending feedback; state changes animated (not 0ms) | Hover-only affordances; instant, unacknowledged state changes |
| 4 | **States & feedback** | Every screen specifies empty, loading, and error states; errors adjacent to their cause and specific | Placeholder-as-label; errors only summarised at top; happy-path-only specs |
| 5 | **Layout & responsive** | Mobile-first breakpoints; no horizontal body scroll; wide content (tables/diagrams) scrolls in its own container | Fixed-px container widths; disabling zoom; the page body scrolling sideways |
| 6 | **Typography & colour** | Base ≥16px body, line-height ~1.5; **semantic tokens, never raw hex in components** (see design-tokens skill) | Body text <12px; gray-on-gray; hardcoded colours |
| 7 | **Platform fit** (MSS) | Design within the surface's real limits — model-driven form chrome, PCF frame, Power Pages templating; confirm feasibility before specifying | Specifying an interaction the platform can't render; ignoring the fixed host frame |
| 8 | **Animation** | 150–300ms; motion conveys meaning/continuity; honour `prefers-reduced-motion` | Decorative-only motion; animating width/height; no reduced-motion path |
| 9 | **Forms** | Visible labels; helper text; progressive disclosure; group related fields | Overwhelming the user upfront; validation only on submit |
| 10 | **Charts & data** | Legends, tooltips, accessible categorical colours | Colour-alone encoding; unlabelled axes |

## How to use

- **Designing** (`ui-ux-designer`): specify against 1–6 for every screen; add 7 for
  any Dynamics/PCF/Power Pages surface. Rows 1–2 are requirements, not nice-to-haves.
- **Building** (`frontend`): items 1, 3, 5, 6 are the ones most often skipped in code.
- **Reviewing** (`code-reviewer`): a UI change that fails a rank-1–4 item is a
  rejection, not a nit. Reference the row number.

This is a floor on craft, not a substitute for the `ui-ux-designer`'s judgment or the
`auditor`'s accessibility/compliance sign-off. It complements the design-tokens skill
(row 6) and `verification-before-completion` (prove the states/contrast, don't assume).
