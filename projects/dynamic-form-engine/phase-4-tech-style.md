# DFE-STYLE-001 — Phase 4 Build Summary

**Status:** Build substantially complete; verified locally. Code review (Step 7) in progress.
**Date:** 2026-06-29. **Guardrails honoured:** nothing committed, no live-org schema deploy.

> The Step 6 build was interrupted twice (one accidental user stop, one watchdog stall during
> wrap-up). The application code was already written before the stalls; this phase was completed
> directly: verification, a 1-line fix, provisioning script, runbook, cleanup, and this summary.

---

## Verification (local)

**TypeScript (strict) — all 4 packages clean:**
| Package | Typecheck |
|---|---|
| shared | ✅ |
| backend | ✅ |
| designer | ✅ |
| frontend | ✅ (after a 1-line fix in `customCssInjector.ts` — `PostCSS` null guard) |

**Unit tests:** backend **208 passed**, designer **69 passed**, frontend **165 passed** (442 total). shared typechecks; covered transitively.

**SC-02 gating spike — PASS.** The PostCSS browser IIFE bundle (`designer/public/postcss-bundle.iife.js`, 133 KB) loads with only a `window` shim, `parse()` returns nodes, `process()` round-trips CSS, no `process.env` leakage. The on-prem PostCSS sanitizer path (C-005b) is viable. Manual confirmation in a real CRM web-resource iframe remains a recommended final check (`postcss-spike-test.html` shipped for that).

---

## Schema (reconciled against org5869857f, 2026-06-29)

**Correction to the architecture's "56 new attributes":** that figure was wrong. The design
entities (theme/form/section/field/button) and `qdb_layout_grid` were **already fully
provisioned by DFE-ADD** under the names in the styleAttributeNames registries. Comparing the
actual org attributes to the code constants, **DFE-STYLE-001 adds only**:
- `qdb_section_design.qdb_css_class` (Text) — `SectionDesign.cssClassName`
- `qdb_field_design.qdb_field_css_class` (Text) — `FieldDesign.cssClassName`
- `qdb_css_allowlist_config` (new entity) + 3 attrs + a seeded **`global`** record

**Attribute-name reconciliation (was a Blocker):** the **designer** `styleAttributeNames.ts`
had wrong names for several attributes (`qdb_form_button_style`, `qdb_header_style_json`, the
field `*_style_json` names, `qdb_btn_border_radius`, `qdb_btn_alignment`). The **backend**
constants and the org were already correct. Fixed the designer constants → org names, so
button/field/section styling now reads/writes real attributes. Also corrected the allowlist
seed key to **`global`** (matches `AllowlistService`'s query) — `default` would never have matched.

`scripts/provision-style-schema.mjs` rewritten to this minimal scope (idempotent, dry-run
supported; **not executed**). Deployment sequencing + rollback: `DEPLOYMENT-RUNBOOK-style.md` (C-004a).

---

## Skeptic challenge resolutions (build state)
- **SC-01** import-failure guard — provisioning exits non-zero + `PROVISIONING FAILED`; runbook documents detection + rollback. ✅
- **SC-02** PostCSS-in-sandbox — spike PASS (proxy-verified). ✅
- **SC-03..SC-08** — implemented in the build code (async STYLE_CHANGE trigger, branded ThemeDefinition, allowlist-admin role in `crm-solution/src/Roles/`, sub-object StyleEngine memoization, on-prem fail-safe allowlist, in-memory WCAG gate). **To be confirmed by the code review.**
- **SC-09** `attributeNames` split — done (form/rule/design/grid/i18n/publish/style registries). ✅
- **SC-10** lockfile audit — `npm audit --audit-level=high` prescribed; current DFE lockfiles verified clean of the Sept-2025 `color`/`chalk`/`debug` supply-chain versions. ✅

---

## File inventory (high level)
- **shared:** `src/sanitizer/`, `src/utils/` (contrastRatio), `src/validation/` (Zod design schema), `design.types.ts` (branded), `server.ts`.
- **backend:** `DesignAssembler.ts` (+test), `CacheAssemblyService.ts`, `DesignPicklistMappers.ts`, `src/sanitizer/`, `src/constants/`.
- **designer:** 6 `*DesignRepository.ts`, `AllowlistService.ts`, `src/screens/style/`, `src/components/`, store migration (`designerStore`, `DesignService`, `DesignerStyleModel`), `attributeNames` split, modified screens.
- **frontend:** `StyleEngine.ts`, `customCssInjector.ts`.
- **crm:** allowlist-admin role.

## Cleanup
Removed stray debug artifacts (`frontend/screenshot.cjs`, `verify-*.cjs`, `verify-*.png`).

---

## Status of prior open items (all RESOLVED + re-review-confirmed 2026-06-29)
1. **Code review (Step 7):** B-001 / B-002 / M-001 fixed + verified. Attribute-name mismatch
   RESOLVED. Contained majors/minors done: M-002, M-003, M-005, M-006, M-007, m-002, m-003.
   Re-review = PASS WITH FOLLOWUPS; NEW-001 (section headerStyle data loss) + NEW-002 fixed.
   Still DEFERRED (clean-code only, non-functional, pre-release tech-debt): M-004 (split
   designerStore), M-008 (residual `as` casts), M-009/M-010 (DI via interfaces), m-001, m-004.
2. **Picklist round-trip — DONE** (`6d5819b` + theme in `4aa7490`): all six design repos write
   picklist integer codes and read via reverse maps (org-verified, None=100000001).
3. **cssClassName end-to-end — DONE** (`a7ab855`): backend `DesignAssembler` + constants read
   `qdb_css_class`/`qdb_field_css_class`; runtime applies via `mergeClasses` (portal + on-prem).
4. Optional: confirm SC-02 in a real CRM iframe.

## Remaining pipeline
- ✅ QA (Step 8): `phase-5-qa-style.md` (107 test cases, mapped to SM-001..008). Its "open gaps"
  framing for picklist/cssClassName/headerStyle predates the fixes above — those are implemented;
  the QA cases are the verification gate for them.
- Audit (Step 9): DONE (`phase-6-audit-style.md`) — PASS-style but NOT-CLEARED with 2 go-live
  blockers, both now FIXED: SEC-01 (BR-012 style-change audit log — wired into FormSaveService +
  ThemeStylePanel for the persisted theme/formDesign paths) and SEC-02 (CSS Allowlist Admin role
  write elevated Basic→Organization). Plus SEC-12 (freeze FAILURE_RESULT) and SEC-10 (GUID guard
  in DesignAssembler). Remaining audit items are non-blocking pre-release (SEC-04/06/07/08/11) or
  client/ops conditions (OQ-007, OQ-010, enable Dataverse Auditing on qdb_css_allowlist_config,
  deploy-time role check, real-env test runs) → carry into CEO-final conditions.
- ⚠️ **NEWLY DISCOVERED GAP (functional, > the audit log itself):** section/field/button/layoutGrid
  design UPSERTS ARE NEVER CALLED — FormSaveService persists only theme + formDesign; the four
  panels update the Zustand store but their styling is **not saved to Dataverse**. So per-section/
  field/button/responsive styling does not round-trip end-to-end yet (the repos + cssClassName +
  picklist work is correct, but the SAVE wiring from store→DesignService for those four is missing).
  This needs the FormSaveService design-save loop extended (and STYLE_CHANGE audit extended to them).
- Then CEO final (Step 10) → user-approved deploy (run `provision-style-schema.mjs` + the CSS
  Allowlist Admin role + publish, per the runbook).

Committed to branch `feat/dfe-style-001` (pushed). The live org is untouched (nothing provisioned/deployed).
