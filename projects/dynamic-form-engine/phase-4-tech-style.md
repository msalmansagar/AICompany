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

## Open before merge/deploy
1. **Code review (Step 7):** B-001 / B-002 / M-001 fixed + verified. Attribute-name mismatch
   RESOLVED (see Schema above). Remaining: M-002–M-010 (file/param/fn-size splits, specific
   exception, DI via interfaces, residual `as` casts) + 4 minors — clean-code debt.
2. **Picklist round-trip in the other repos:** M-001's pattern (write picklist int / read via
   reverse map) was applied to `FormDesignRepository` only. `Section/Field/ButtonDesignRepository`
   write several **Picklist** attributes (e.g. button `qdb_alignment`, section `qdb_card_style`,
   field `qdb_width`) — verify they don't write raw strings into Picklist columns (same bug class).
3. **cssClassName end-to-end:** the 2 net-new attrs exist only after provisioning; the backend
   `DesignAssembler` + backend constants don't yet read `qdb_css_class`/`qdb_field_css_class`, so
   confirm cssClassName flows into the render-cache `DesignPayload` once provisioned.
4. Optional: confirm SC-02 in a real CRM iframe.
5. Then: QA (Step 8) → Audit (Step 9) → CEO final (Step 10).
6. Deploy = run `provision-style-schema.mjs` + the CSS Allowlist Admin role + publish, per the runbook (user-approved).

Committed to branch `feat/dfe-style-001` (pushed). The live org is untouched (nothing provisioned/deployed).
