# Phase 4 — QA: Test Strategy
Date: 2026-03-29

## Scope

This document defines the test strategy for the unified design demo page (`demo.html`). Since this is a static, self-contained HTML file with no backend, testing is entirely client-side: visual, functional, accessibility, performance, and cross-browser.

---

## Test Categories

### 1. Visual Regression Tests

Purpose: Verify that each of the three design system signatures is clearly visible and distinct.

| Test ID | Test Case | Pass Criteria |
|---|---|---|
| VIS-01 | Fluent acrylic header is visible on scroll | Header shows blur effect behind content below it |
| VIS-02 | Fluent reveal highlight on card hover | Radial light follows mouse cursor on each feature card |
| VIS-03 | Fluent shadow depth differences | Card shadow increases visibly on hover |
| VIS-04 | Apple HIG generous whitespace | Hero section has ≥ 80px vertical padding top/bottom |
| VIS-05 | Apple HIG type scale visible | At least 4 distinct type sizes render simultaneously on screen |
| VIS-06 | Apple HIG smooth animation | Hero content entrance animation plays on page load without jitter |
| VIS-07 | One UI bold card radius | Feature cards show clearly rounded corners (≥ 20px) |
| VIS-08 | One UI vibrant accent color | Primary button and active nav item both use `#1259C3` or `#2979FF` |
| VIS-09 | One UI bottom navigation visible on mobile | At 390px, bottom nav is fixed at viewport bottom |
| VIS-10 | Unified coherence | Three sections do not appear as three separate apps — overall page reads as one design |

### 2. Responsive Layout Tests

| Test ID | Viewport | Test Case | Pass Criteria |
|---|---|---|---|
| RES-01 | 390px × 844px | Hero heading does not overflow | Text wraps, no horizontal scroll |
| RES-02 | 390px × 844px | Bottom nav present and usable | 4 items visible, each ≥ 48px tall |
| RES-03 | 390px × 844px | Cards are single column | Only 1 card per row |
| RES-04 | 768px × 1024px | Cards switch to 2 columns | 2 cards per row visible |
| RES-05 | 768px × 1024px | Bottom nav absent, header nav present | No bottom bar; header shows nav links |
| RES-06 | 1440px × 900px | Content container capped at 1200px | Left/right margins visible, no edge bleed |
| RES-07 | 1440px × 900px | Cards in 3 columns | 3-column grid renders correctly |
| RES-08 | Any | No horizontal scrollbar | `overflow-x` is never triggered |

### 3. Interaction & Functional Tests

| Test ID | Action | Expected Result |
|---|---|---|
| INT-01 | Click primary button | Ripple animation plays from click origin |
| INT-02 | Hover over feature card | Card lifts 4px, shadow deepens, reveal highlight appears |
| INT-03 | Click "Show Notification" button | Toast slides in from top-right (desktop) / bottom (mobile), auto-dismisses in 4s |
| INT-04 | Click accordion item | Content expands with smooth max-height animation, chevron rotates 180° |
| INT-05 | Click expanded accordion item | Content collapses, chevron returns to 0° |
| INT-06 | Click bottom nav item | Active state updates (color + indicator pip), no page reload |
| INT-07 | Scroll down page | Sections fade in and translate up as they enter viewport |
| INT-08 | Scroll past 20px | Header acrylic effect becomes active (if JS-driven class) |
| INT-09 | Click secondary button | No ripple; slight background tint on hover only |
| INT-10 | Press Tab key through interactive elements | Focus ring appears on each element in logical order |

### 4. Accessibility Tests

| Test ID | Tool / Method | Test Case | Pass Criteria |
|---|---|---|---|
| A11Y-01 | Browser DevTools / axe | All images have alt text | Zero missing alt violations |
| A11Y-02 | Colour Contrast Analyser | Body text on white background | ≥ 4.5:1 contrast ratio (WCAG AA) |
| A11Y-03 | Colour Contrast Analyser | White text on accent button | ≥ 4.5:1 contrast ratio |
| A11Y-04 | Keyboard navigation | Tab through all interactive elements | All reach focus, none trapped |
| A11Y-05 | Screen reader (NVDA/VoiceOver) | Heading hierarchy | h1 → h2 → h3 — no levels skipped |
| A11Y-06 | axe / browser | ARIA labels on icon-only controls | All nav icons have `aria-label` |
| A11Y-07 | Manual | Bottom nav items labelled | Screen reader reads label + state |
| A11Y-08 | OS setting | prefers-reduced-motion respected | Animations do not play when OS motion reduced |
| A11Y-09 | 200% zoom | Layout survives browser zoom to 200% | No overlapping elements, text readable |
| A11Y-10 | Keyboard | Accordion operable by keyboard | Enter/Space opens/closes accordion items |

### 5. Performance Tests

| Test ID | Tool | Metric | Pass Criteria |
|---|---|---|---|
| PERF-01 | Chrome DevTools Network | Initial page load | Under 2 seconds on fast 3G simulation |
| PERF-02 | DevTools — file size | Total HTML file size | Under 50KB |
| PERF-03 | DevTools Performance panel | Frame rate during scroll | No frames below 60fps (16.7ms) |
| PERF-04 | DevTools Performance panel | Animation FPS | Entrance animations run at 60fps |
| PERF-05 | DevTools Network | External HTTP requests | Zero — page is fully self-contained |
| PERF-06 | DevTools Lighthouse | Performance score | ≥ 90 |
| PERF-07 | DevTools Lighthouse | Accessibility score | ≥ 90 |

### 6. Cross-Browser Tests

| Browser | Version | Test |
|---|---|---|
| Chrome | Latest | Full feature test |
| Edge | Latest | Full feature test (primary Fluent platform) |
| Firefox | Latest | Full feature test — verify `backdrop-filter` fallback |
| Safari | Latest | Full feature test — verify SF Pro renders as system font |
| Chrome Mobile | Android | Responsive + touch interaction test |
| Safari Mobile | iOS | Responsive + touch interaction test |

### 7. Design System Fidelity Checklist

A human reviewer signs off on each item:

- [ ] Fluent acrylic is not just opacity — `backdrop-filter: blur` + `saturate` are both present
- [ ] Fluent reveal highlight is mouse-position-aware (not a static gradient)
- [ ] Fluent shadow has at least 3 depth levels used across the page
- [ ] Apple HIG type scale uses weight contrast (700 vs 400) not just size
- [ ] Apple HIG animations use `cubic-bezier` approximating spring — not `ease` or `linear`
- [ ] Apple HIG whitespace is deliberate — no section feels cramped
- [ ] One UI cards are visually bold — radius ≥ 20px, padding ≥ 24px
- [ ] One UI accent color appears in 3+ places consistently
- [ ] One UI touch targets are ≥ 48px on all interactive elements
- [ ] Bottom navigation is thumb-zone positioned (bottom of screen, not top on mobile)

---

## Test Execution

Since this is a demo artifact, formal test management tooling is not required. QA process is:

1. Open `demo.html` in each listed browser — verify no console errors
2. Run Chrome Lighthouse audit — record scores
3. Run axe DevTools browser extension — clear all violations
4. Manually work through INT-01 to INT-10
5. Resize browser window through all breakpoints — verify RES-01 to RES-08
6. Sign off design fidelity checklist

## Pass/Fail Definition

The page passes QA when:
- Zero critical or serious accessibility violations (axe)
- Lighthouse performance ≥ 90, accessibility ≥ 90
- All RES and INT test cases pass
- Design fidelity checklist fully signed off
- Zero external HTTP requests at runtime
