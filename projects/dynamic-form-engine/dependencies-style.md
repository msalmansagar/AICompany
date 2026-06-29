# DFE-STYLE-001 Dependency Decisions

Project: Dynamic Form Engine — Advanced Visual Styling
Client: QDB
Date: 2026-06-28

---

## Decision Table

| Target | Verdict | Package / Action | Stars | License | Version to pin | Notes |
|---|---|---|---|---|---|---|
| WCAG 2.1 contrast ratio calculator | BUILD | Implement `contrastRatio.ts` in-house (~30 lines, pure function) | N/A | N/A | N/A | No dedicated library at 1000+ stars. `wcag-contrast` has 123 stars and is 7 years stale. `color` npm package had September 2025 supply-chain attack (v5.0.1 malware). If `polished` (7,700 stars, MIT) or `chroma-js` (10,000 stars, BSD) is already in the dependency tree for another reason, use its `getContrast` function instead of duplicating the algorithm. |
| CSS sanitizer for user-entered `customCss` | ADAPT | `postcss` (CSS AST foundation) + in-house `CssSanitiserPlugin.ts` (~150-200 lines) | 29,000 | MIT | `^8.x` | No ready-made CSS sanitizer at 1000+ stars. DOMPurify is HTML-only and DOM-dependent. `eramdam/postcss-sanitize` has under 50 stars and no security CVE track record. PostCSS (May 2026 last commit) provides the AST backbone. Write the plugin to strip `@import`, `url()` non-allowlisted domains, `expression()`, and `behavior:`. |
| Color picker UI component | ADOPT | `@fluentui/react-color-picker` | ~18,000 (parent: microsoft/fluentui) | MIT | `^9.2.2` | Stable Fluent UI v9 native component as of v9.0.0 (graduated from preview). No NFR-010 violation. Components: `ColorPicker`, `ColorArea`, `ColorSlider`, `AlphaSlider`, `ColorSwatch`. Last published June 22, 2026. |
| CSS key-value property editor | BUILD | Implement `CssPropertyEditor.tsx` in-house (~50 lines, Fluent UI v9 composition) | N/A | N/A | N/A | No library at 1000+ stars covers this pattern without introducing a foreign design system. Compose `Input` + `Button` + flex column using existing Fluent UI v9 primitives. |

---

## Disqualified candidates (do not adopt)

| Package | Reason |
|---|---|
| `tmcw/wcag-contrast` | 123 stars; last published 7 years ago. Abandoned. |
| `Qix-/color` | Supply-chain attack September 2025. npm account taken over; v5.0.1 contained malware. Trust signal permanently damaged for QDB use. |
| `uiwjs/react-color` | 536 stars; below 1000-star threshold. |
| `casesandberg/react-color` | ~11,000 stars but archived and unmaintained since 2022. Incompatible with React 18+ hooks patterns. |
| `cure53/DOMPurify` | HTML sanitizer, DOM-dependent. Cannot sanitize standalone CSS stylesheet strings without jsdom. Wrong architectural fit. |
| `eramdam/postcss-sanitize` | Under 50 stars. Not security-audited. Insufficient battle testing for security-critical sanitization at QDB. |
| `csstools/sanitize.css` | CSS reset file (not a runtime sanitizer). Completely wrong use case. |

---

## Secondary option (color picker)

If `@fluentui/react-color-picker` is found to be insufficient (e.g., missing gradient saturation picker or WCAG indicator overlay support), the fallback is:

| Package | Stars | License | Bundle | Notes |
|---|---|---|---|---|
| `react-colorful` (omgovich/react-colorful) | ~3,500 | MIT | 2.8 KB gzip | Headless, zero dependencies. Ships its own CSS layer — requires skinning to match Fluent UI v9 design tokens. Minor NFR-010 tension (own visual style), but manageable. Last published April 2026. |

---

## Full research report

See `github-research-style.md` in this directory for the complete candidate-by-candidate analysis including all queries, star counts, last commit dates, licenses, bundle sizes, and fit assessments.
