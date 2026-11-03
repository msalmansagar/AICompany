# DFE-ENH-001 — Conditions Clearance Log

Tracks resolution of the CEO's BRD-approval conditions (see `phase-1-ceo.md`).

## Pre-Phase-1 conditions

### C-001 — WCAG sign-off authority — CLEARED (2026-07-10)
QDB designates an **internal Accessibility Officer** as the accountable WCAG 2.1 AA
sign-off authority for rendered forms. **ENT-008 completion criterion:** the named
Accessibility Officer's written approval per form/release. Certification stays in-house
(no third-party auditor this cycle).
- Decision owner: QDB (provided via engagement lead).
- Follow-up: QDB to record the specific Officer's name/role in the ENT-008 acceptance
  criteria during Phase 1 architecture.

### C-002 — Dataverse ETag / optimistic-concurrency support — CLEARED (2026-07-10)
Owner: Architect. Status: **CLEARED**.
- Live probe against org5869857f on `qdb_form_definition`: GET returned `@odata.etag: W/"187623029"`;
  PATCH with fake etag returned **412 Precondition Failed**; PATCH with correct etag returned **204 No Content**.
- Platform-level behavior — applies to all DFE custom entities without per-entity configuration.
- ADR written: `phase-3-arch-conditions.md` § ADR-C002.
- FR-001 proceeds using native etag / If-Match pattern with conflict-resolution dialog on 412.

### C-003 — DFE-STYLE-001 status & FR-009 / FR-012(b) ownership — CLEARED (2026-07-10)
Owner: Architect. Status: **CLEARED**.
- STYLE-001 is **ACTIVE**. Branch `feat/dfe-designer-style-load` has commits from 2026-07-09 and
  2026-07-10 (today), all tagged DFE-STYLE-001. Not paused; 90-day-pause criterion not met.
- **FR-009** (keyboard nav + dnd-kit): DFE-ENH-001 owns full functional scope. ENH-001 must branch
  from `feat/dfe-designer-style-load` for FR-009 work to avoid component-structure merge conflicts.
- **FR-012(a)** (Form Code auto-derive): DFE-ENH-001 owns outright; no coordination needed.
- **FR-012(b)** (Field Properties panel overflow): deferred to STYLE-001 (primary delivery vehicle);
  fallback to ENH-001 if STYLE-001 does not deliver before ENH-001 architecture checkpoint.
- ADR written: `phase-3-arch-conditions.md` § ADR-C003.

## Go-live conditions — notes

### HC-1 / GL-04 — on-prem/UCI If-Match verification — OPEN (+ smoke evidence 2026-07-12)
Local browser smoke test of the integration branch `feat/dfe-enh-save-integration` (@ b78d948) on a
standalone Vite instance (:5180, REST mode via dev-proxy :3001 → org5869857f) surfaced concrete
evidence for this condition:
- **Positive:** the branch builds and runs; form list + forms + canvas/property panels render live; the
  FR-001 concurrency guard is genuinely active — a Save Draft was correctly refused with
  `MissingEtagError` ("no etag was provided; load via getFormWithEtag() before saving"). Fail-safe, no
  silent overwrite, exactly as the architecture mandates. Nothing was written to the org.
- **Finding:** in the **local REST/dev-proxy path** the `@odata.etag` never reaches the designer, so the
  strict guard blocks ALL saves. Root cause is local tooling — `RestWebApiAdapter.request` returns only
  `response.json()` and discards the HTTP `ETag` header, and the dev-proxy sends no
  `Prefer: odata.include-annotations`. The production Dynamics UCI path uses `Xrm.WebApi.retrieveRecord`,
  which returns `@odata.etag` natively — so this is a dev-tooling gap, **not confirmed as a product defect**.
- **Action for HC-1:** the live-org validation session must confirm `getFormWithEtag` populates the etag and
  `If-Match` yields a 412 in the real UCI iframe. Optional local-only convenience fix (not required for
  production): capture the etag from the `ETag` response header in `RestWebApiAdapter`. Deliberately NOT
  applied — parked with this condition.
