# Phase 5 — Auditor: Risk & Governance Review
Date: 2026-03-29

## Executive Summary

This audit reviews the unified design demo page against accessibility standards, data governance, intellectual property considerations, security hygiene, and organisational policy. The page is a static, self-contained demonstration artifact with no backend, no user data processing, and no network calls — this significantly limits the risk surface. Several items require attention before the page is used in external client presentations.

---

## 1. Accessibility & Inclusive Design

### Findings

| Ref | Finding | Severity | Status |
|---|---|---|---|
| ACC-01 | `backdrop-filter` fallback required for Firefox and older browsers | Medium | Must fix before release |
| ACC-02 | Colour palette swatches section may use colours that fail 3:1 non-text contrast ratio when showing design tokens | Medium | Must verify in implementation |
| ACC-03 | Accordion items must be implemented as `<button>` elements, not `<div>` click handlers | High | Must fix |
| ACC-04 | Bottom navigation must use `<nav>` landmark with `aria-label="Primary navigation"` | High | Must fix |
| ACC-05 | Animated entrance effects must check `prefers-reduced-motion` — confirmed in Phase 3 spec, must verify in implementation | Medium | Verify in code |
| ACC-06 | Toast/notification must not auto-dismiss in under 4 seconds (WCAG 2.2 guideline 2.2.1) — 4s specified, acceptable | Pass | No action |
| ACC-07 | Icon-only bottom nav buttons require `aria-label` — confirmed in QA scope | High | Verify in implementation |

### WCAG 2.1 AA Compliance Target

The page is required to meet WCAG 2.1 AA. The primary risk points:
- One UI accent `#1259C3` on white `#FFFFFF`: contrast ratio = **5.22:1** — PASSES AA
- Secondary text `#6E6E73` on white: contrast ratio = **5.74:1** — PASSES AA
- Tertiary text `#AEAEB2` on white: contrast ratio = **2.49:1` — FAILS AA for body text — **Must not be used for body copy, only decorative or non-essential labels**
- White text on accent `#1259C3`: contrast ratio = **5.22:1** — PASSES AA for large text and UI components

Recommendation: `#AEAEB2` is restricted to icon placeholders and decorative rules only. Any informational text at this colour must be darkened to `#8E8E93` or darker.

---

## 2. Intellectual Property & Trademark Risk

### Analysis

The page references and draws inspiration from:
- Microsoft Fluent Design System (publicly documented, open design principles)
- Apple Human Interface Guidelines (publicly documented)
- Samsung One UI design language (publicly documented)

### Risks

| Ref | Risk | Assessment |
|---|---|---|
| IP-01 | Using trademarked names "Fluent Design", "Human Interface Guidelines", "One UI" in the UI itself | Low-Medium | Acceptable in a demonstration/educational context; do not present as an official Microsoft/Apple/Samsung product |
| IP-02 | Copying proprietary icons from any of the three systems | High | Do not use SF Symbols, Fluent System Icons (unless Apache-licensed versions), or Samsung icons — use custom SVG icons only |
| IP-03 | SF Pro font is Apple proprietary | Medium | System font stack approach (`-apple-system`) is correct and safe — never embed SF Pro as a font file |
| IP-04 | Segoe UI font is Microsoft proprietary | Low | System font stack renders it on Windows natively — acceptable. Never distribute as embedded font |

### Recommendation
- Page header/footer must carry the note: "Design principles inspired by Microsoft Fluent Design System, Apple Human Interface Guidelines, and Samsung One UI. This page is not affiliated with or endorsed by Microsoft, Apple, or Samsung."
- Use only SVG icons created by Maqsad AI or sourced from MIT/Apache-licensed icon sets

---

## 3. Security Review

Since the page is static HTML with no network calls, the attack surface is minimal. Residual risks:

| Ref | Risk | Assessment |
|---|---|---|
| SEC-01 | Inline JavaScript eval() usage | Not anticipated — vanilla JS. Verify no `eval()` appears in final code |
| SEC-02 | External CDN links in `<head>` | Architect specifies zero external requests — verify `<link>` and `<script src>` are absent |
| SEC-03 | If served via HTTP (not file://), Content Security Policy should be set | Out of scope for file:// delivery; note for any future hosting |
| SEC-04 | No user input fields — no XSS, SQLi surface | Pass |
| SEC-05 | No cookies, no localStorage, no session data | Pass |

---

## 4. Data Residency & Privacy

Not applicable — the page collects no personal data, does not connect to any server, and does not use analytics, telemetry, cookies, or tracking pixels.

If the page is later hosted and analytics are added, a separate privacy review is required per QDB data residency requirements.

---

## 5. Brand & Presentation Governance

| Ref | Requirement | Status |
|---|---|---|
| BRD-01 | Maqsad AI branding must be present (logo or wordmark) | Must include |
| BRD-02 | Disclaimer about third-party design systems required | Must include |
| BRD-03 | Page must not falsely imply partnership with Microsoft, Apple, or Samsung | Must verify page copy |
| BRD-04 | Contact / attribution for enquiries | Recommended |

---

## 6. Open Source & License Compliance

If any external icon set or asset is used:
- Verify license (MIT, Apache 2.0, or CC-BY acceptable)
- Attribution comment must appear in the HTML source for any third-party asset
- No GPL assets (would require publishing the demo under GPL)

---

## 7. Audit Verdict

**Conditional PASS** — the design and architecture are sound. The following items are required before the page is used in any external client presentation:

| Priority | Item |
|---|---|
| CRITICAL | Accordion triggers implemented as `<button>`, not `<div>` |
| CRITICAL | Bottom nav uses `<nav>` landmark + `aria-label` |
| CRITICAL | Icon-only nav buttons have `aria-label` |
| HIGH | `#AEAEB2` not used for informational text |
| HIGH | `@supports (backdrop-filter: blur(1px))` fallback present |
| HIGH | IP disclaimer added to page footer |
| HIGH | No SF Pro / Segoe UI font files embedded |
| MEDIUM | `prefers-reduced-motion` verified in final code |
| MEDIUM | Zero external HTTP requests verified via DevTools |

The auditor will issue full PASS upon confirmation that these items are addressed in the `demo.html` implementation.
