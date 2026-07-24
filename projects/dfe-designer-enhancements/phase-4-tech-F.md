# DFE-ENH-001 — Phase 4 Workstream F: ENT-008 WCAG 2.1 AA Test Harness

**Engagement ID:** DFE-ENH-001
**Workstream:** F (ENT-008 — WCAG 2.1 AA Test Harness)
**Prepared by:** Maqsad AI — Frontend
**Date:** 2026-07-11
**Branch:** feat/dfe-enh-a11y
**Status:** COMPLETE — F1–F4 delivered; F5 (remediation) is gated

---

## F1 — Dependency Installation

### Packages Added to `projects/dynamic-form-engine/designer/package.json` devDependencies

| Package | Version | License | Purpose |
|---|---|---|---|
| `axe-core` | `^4.10.0` | MPL-2.0 | Accessibility rule engine used by both vitest-axe and @axe-core/playwright |
| `@axe-core/playwright` | `^4.10.0` | MIT | Layer 1 E2E gate — runs axe-core against live Chromium via Playwright |
| `vitest-axe` | `^0.1.0` | MIT | Layer 2 component unit test — runs axe-core against jsdom-rendered components |
| `@playwright/test` | `^1.48.0` | Apache-2.0 | Playwright test runner for E2E spec |

**Actual installed versions (from workspace node_modules):**
- `axe-core@4.x` (resolved by npm from `^4.10.0`)
- `vitest-axe@0.1.0`
- `@axe-core/playwright` at `^4.10.0`

### ADR-004 MPL-2.0 Acceptance Note

`axe-core` is licensed under MPL-2.0 (Mozilla Public License 2.0, file-level copyleft).
Acceptance decision per ADR-004 (DFE-ENH-001 Phase 3): accepted for dev/test-only use.
The copyleft obligation applies only to modifications of axe-core itself; unmodified use
in test infrastructure does not require the enclosing application to be MPL-licensed.

---

## F2 — Bundle Exclusion Proof

**Method:** `build.rollupOptions.external` in `vite.config.ts`

```typescript
// vite.config.ts (excerpt)
rollupOptions: {
  /**
   * ADR-004 (DFE-ENH-001 ENT-008): axe-core (MPL-2.0) and its wrappers are dev/test-only.
   * Listing these as external prevents them from being bundled into the CRM web resource
   * if they are ever accidentally imported from src/. See F2 explanation below.
   */
  external: ['axe-core', '@axe-core/playwright', 'vitest-axe', '@playwright/test'],
  output: { ... }
}
```

**Primary protection:** The packages are only imported in `tests/` files. Vite never includes
`tests/` in its module graph — test files are not reachable from the entry point (`src/main.tsx`)
and are never passed to Rollup. This means the packages cannot end up in the bundle regardless
of the `external` setting.

**What `external` does (and does not) provide:** Declaring a package external causes Rollup to
emit a bare `import 'pkg'` statement in the output rather than bundling its code. If such an
import appears in the shipped web resource and the browser cannot resolve it, the result is a
runtime module-not-found error — it is NOT a build-time error. `external` alone is therefore
not a safety gate against accidental imports from `src/`; it only controls bundling behaviour
for imports that Rollup actually encounters.

**Belt-and-suspenders value:** The `external` declaration is retained as a safeguard against
accidental imports introduced in future `src/` code. If a developer incorrectly imports an
axe-core package from within `src/`, the production bundle will contain an unresolvable external
reference, which will fail loudly at runtime in the CRM context (where there is no package
resolver). This makes the problem visible in production smoke tests rather than silently bundling
MPL-2.0 code. The primary gate remains: all accessibility packages are dev/test-only and must
never be imported from `src/`.

---

## F3 — Test Types

### Layer 2 — vitest-axe Component Scan

**File:** `projects/dynamic-form-engine/designer/tests/a11y/TabProperties.a11y.test.tsx`

**Component under test:** `TabProperties` — the properties panel rendered when a form tab is
selected in the designer canvas. Chosen because:
- It has a rich properties form (inputs, switches, accordion sections, textarea)
- It can be rendered synchronously in jsdom without async data loading
- The mock pattern is established and proven in the existing test suite

**Test configuration:**
- Vitest environment: `jsdom`
- axe tags: `['wcag2a', 'wcag2aa']` — WCAG 2.1 Level A and AA only
- Extended expect: `toHaveNoViolations()` registered in `tests/setup.ts`
- Type augmentation: `tests/types/vitest-axe.d.ts` (Vitest 2.x compatible)

**Test scenarios:**
1. `TabProperties_defaultState_hasNoWcag2aaViolations` — panel in default state (hideTabBar: false)
2. `TabProperties_hideTabBarEnabled_hasNoWcag2aaViolations` — panel with hideTabBar: true

### Layer 1 — @axe-core/playwright E2E Scan

**File:** `projects/dynamic-form-engine/designer/tests/e2e/a11y-designer.spec.ts`

**Config:** `projects/dynamic-form-engine/designer/playwright.config.ts`

**Target:** Vite dev server at `http://localhost:5173` (or `PLAYWRIGHT_BASE_URL` env var in CI)

**Test scenarios:**
1. `designerFormList_axeWcagAaScan_hasNoViolations` — scans the form list page (designer home)
2. `designerRootPage_axeWcagAaScanRootOnly_hasNoViolations` — scans the root page only; full canvas scan wired in F5

**CI gate:** Zero AA violations is a hard gate — PRs introducing new violations are blocked.
The E2E test annotates the Playwright HTML report with the full violation JSON when violations
are found, enabling the F4 inventory to be read from the CI artifact.

**Note:** The E2E tests require a running Vite dev server (`npm run dev`). They are not run
in the `npm run test` suite; CI must start the dev server before executing `npm run test:e2e`.

---

## F4 — First Scan Inventory

### Layer 2 (vitest-axe, jsdom) — EXECUTED

**Date:** 2026-07-11
**Component:** `TabProperties` (designer properties panel)
**axe tags:** `wcag2a`, `wcag2aa`

**Results:**
```
Test Files  1 passed (1)
Tests       2 passed (2)
```

**Layer 2 structural/ARIA violation count: 0**

**IMPORTANT — this count does NOT represent full WCAG 2.1 AA coverage.**
The jsdom environment does not compute CSS styles. The following axe-core rule categories
are effectively skipped in jsdom and will only be evaluated by the Layer 1 Playwright scan:
- WCAG 1.4.3 Contrast (Minimum) — requires real CSS rendering
- WCAG 1.4.11 Non-text Contrast — requires real CSS rendering
- WCAG 2.4.7 Focus Visible — requires real focus state in a browser

The CEO ">20 violations → pause" gate CANNOT be judged from this Layer 2 result alone.
The Layer 1 Playwright E2E scan must complete before the gate is formally evaluated.

**What the Layer 2 scan did verify:**
- All form inputs have programmatic labels (Fluent UI `Field` component associates labels)
- All interactive switches have accessible names (`Switch` component uses the `label` prop)
- The `<main>` landmark wraps the component content (added in the test fixture)
- No invalid ARIA attributes detected
- No missing required ARIA attributes detected
- Accordion uses correct `role="button"` on headers (Fluent UI v9 AccordionHeader)

**CEO ">20 → pause" rule status:** PENDING — cannot be judged until Layer 1 completes.
The F5 workstream must be gated on the Layer 1 scan result, not on the Layer 2 "0" count.

### Layer 1 (Playwright E2E) — NOT YET EXECUTED — QA GATE REQUIRED

**Reason not executed in this worktree:**
The designer's Vite dev server requires Dataverse org credentials to fetch form definitions
from the CRM. The worktree has no live org connection and the designer does not ship a
standalone mock REST API (the `designer/scripts/dev-proxy.mjs` forwards to a real org;
it cannot run without a valid access token). There is no `dev-mock-api.mjs` equivalent
in this workspace.

**QA gate (mandatory before F5 and CEO judgment):**
The Layer 1 scan MUST be executed in a QA environment with a running Vite dev server
connected to a Dataverse sandbox org before the CEO ">20 → pause" gate can be formally judged:

```bash
# In the QA environment (designer directory):
VITE_USE_REST_API=true npm run dev   # starts Vite dev server on :5173

# In a second terminal:
npm run test:e2e                     # runs @axe-core/playwright against :5173
```

The Playwright HTML report (default: `playwright-report/index.html`) will contain the
full violation list with `a11y-violations` annotations for each failing test.

**Expected violation categories from Layer 1 (predicted, not confirmed):**
Color contrast is the most likely category. Fluent UI v9 design tokens are calibrated
for WCAG AA in general, but the following should be verified against real rendered contrast:
- Placeholder text (`tokens.colorNeutralForeground4`) — typically 3.0:1, borderline AA
- Hint / helper text (`tokens.colorNeutralForeground3`) — typically 3.5:1, may fail AA
- Disabled state text — intentionally lower contrast; verify exemption applies (non-operable)
- Focus ring on dark panel backgrounds — verify 3:1 against adjacent colors (WCAG 1.4.11)

---

## Files Produced

### Modified Files
| File | Change |
|---|---|
| `projects/dynamic-form-engine/designer/package.json` | Added `axe-core`, `@axe-core/playwright`, `@playwright/test`, `vitest-axe` to devDependencies; added `test:a11y`, `test:e2e`, `typecheck:e2e` scripts |
| `projects/dynamic-form-engine/designer/vite.config.ts` | Added `build.rollupOptions.external` with ADR-004 comment |
| `projects/dynamic-form-engine/designer/tests/setup.ts` | Added `toHaveNoViolations` matcher registration + canvas stub |
| `projects/dynamic-form-engine/designer/tsconfig.json` | Added `exclude: ["tests/e2e"]` (e2e uses @playwright/test types, separated) |

### New Files
| File | Purpose |
|---|---|
| `projects/dynamic-form-engine/designer/tests/a11y/TabProperties.a11y.test.tsx` | Layer 2 vitest-axe component scan — TabProperties |
| `projects/dynamic-form-engine/designer/tests/e2e/a11y-designer.spec.ts` | Layer 1 @axe-core/playwright E2E scan |
| `projects/dynamic-form-engine/designer/playwright.config.ts` | Playwright config pointing at Vite dev server |
| `projects/dynamic-form-engine/designer/tsconfig.e2e.json` | Separate tsconfig for E2E tests (@playwright/test types) |
| `projects/dynamic-form-engine/designer/tests/types/vitest-axe.d.ts` | Vitest 2.x type augmentation for `toHaveNoViolations()` + module override for vitest-axe@0.1.0 type bug |
| `projects/dfe-designer-enhancements/a11y-manual-checklist.md` | NVDA + VoiceOver manual test checklist (5 sections, QDB AO sign-off line) |
| `projects/dfe-designer-enhancements/phase-4-tech-F.md` | This document |

---

## Manual Checklist Location

`projects/dfe-designer-enhancements/a11y-manual-checklist.md`

The checklist covers 6 sections:
1. Single-step rendered form (10 checks)
2. Multi-step rendered form (6 checks)
3. RTL Arabic form (5 checks)
4. Designer canvas authoring UI (8 checks)
5. Conflict resolution dialog (5 checks, FR-001 component)
6. Timeout and session management (4 checks — WCAG 2.2.1 + 4.1.3)

Total: 38 manual test items covering NVDA (Windows) and VoiceOver (macOS).
Sign-off line requires: QDB Accessibility Officer + Maqsad AI Frontend Lead.

---

## F5 Gating

Remediation is the F5 workstream, gated on:
1. Layer 1 Playwright E2E scan completion in QA (requires running Vite dev server against Dataverse sandbox)
2. CEO acknowledgement of the Layer 1 violation count before F5 begins
3. If Layer 1 produces > 20 violations: immediate CEO notification + scope/timeline review before any remediation

Current status: Layer 1 E2E NOT YET EXECUTED. The CEO ">20 → pause" rule cannot be
evaluated until Layer 1 completes in a QA environment with a live Dataverse connection.
The Layer 2 "0 violations" count (jsdom structural/ARIA only) does NOT satisfy this gate.

---

## tsc + Test Results

| Check | Result |
|---|---|
| `tsc --noEmit` | PASS — zero errors |
| `vitest run tests/a11y` | PASS — 2/2 tests green, 0 violations |
| `playwright test` | NOT RUN — requires live dev server (F5 scope) |
