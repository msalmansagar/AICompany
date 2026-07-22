# DP-2b — Phase 5 QA Gate
# SLA / Escalation Configuration on SOP Template Steps

| Field | Value |
|---|---|
| Engagement | DP-2b — SLA / Escalation on SOP template steps |
| Verdict | **CONDITIONAL PASS** |
| Date | 2026-07-22 |
| QA Engineer | Maqsad AI — QA |
| Baseline | 88 vitest tests green, tsc clean, production build green |
| Live E2E | 11/11 round-trip verified on org5869857f (provisioning + full SLA create → read-back → R-2 null-clear) |
| Predecessor | DP-2 phase-5-qa.md — defects D-1..D-5 resolved; D-3/D-4 deferred |

---

## Test Strategy Summary

DP-2b is a thin extension of DP-2: the same shared module (`slaStepFields.ts`), the same validator (`slaValidator.ts`), the same generalized component (`SlaEscalationSection`), applied to `qdb_sopstep` instead of `qdb_work_item_steps`. The QA approach follows accordingly:

- **Trust the shared layer.** `buildSlaBody`, `mapSlaFields`, `buildEscalationBindPatches`, `copySlaFields`, and `validateSlaConfig` are already unit-tested in DP-2. Tests for these functions were extended in DP-2b (`copySlaFields` scenarios, R-2 guard tests). Re-testing the underlying logic from scratch would duplicate coverage without adding value.
- **Focus new coverage on the integration seams.** The net-new logic is: (a) the `copySlaFields` spread in `deriveProcessFromSop.ts`, (b) the `copySlaFields` spreads in `useSopSave.ts`, and (c) the `SlaEscalationSection` wiring in `SopStepPanel.tsx`. These are the places a regression is most likely and currently least covered.
- **Treat live E2E as integration-test credit, not CI credit.** The round-trip E2E on org5869857f verified that provisioning, create, read-back, and null-clear all work end-to-end. This is strong evidence. It is not a substitute for automated regression coverage of the derivation path.
- **Do not re-raise resolved DP-2 issues.** D-1 through D-5 from DP-2 are closed. D-3 (view-mode badge) and D-4 (ODataAdapter display names in dev mode) are accepted follow-ups; both apply equally to the SOP side but are already tracked.

---

## FR → Coverage Traceability

| FR | Description | Evidence | Status |
|---|---|---|---|
| FR-001 | 11 new SLA fields on `qdb_sopstep`, all nullable | Live E2E: provisioning + 11-field create → read-back verified on org5869857f | PASS |
| FR-002 | Global option sets reused; no new option sets | `slaOptionCodes.test.ts` (4 tests) cross-checks TS constants vs provisioning script | PASS |
| FR-003 | `SopStep extends SlaFields` | `SopTypes.ts:93` — `export interface SopStep extends SlaFields` | PASS |
| FR-004 | `CreateSopStepRequest extends SlaFields` | `SopTypes.ts:147` — `export interface CreateSopStepRequest extends SlaFields` | PASS |
| FR-005 | `UpdateSopStepRequest` accepts SLA fields | `SopTypes.ts:158` — `export type UpdateSopStepRequest = Partial<SlaFields> & { … }` | PASS |
| FR-006 | `getSopSteps` $select includes SLA columns | `DataverseAdapter.ts:719`, `ODataAdapter.ts:546` — both append `SLA_SELECT_COLUMNS`; `mapSlaFields` spread in `mapSopStep` | PASS |
| FR-007 | `createSopStep` persists all SLA fields | `DataverseAdapter.ts:739–740`, `ODataAdapter.ts:566–567` — `buildSlaBody` + `buildEscalationBindPatches` with `entity='qdb_sopstep'` | PASS |
| FR-008 | `updateSopStep` persists SLA; null-clears on disable | Same as FR-007 pattern; `buildSlaBody({ slaEnabled: false })` writes explicit null for all 8 scalar fields. R-2 null-clear verified live (204 → null read-back). | PASS |
| FR-009 | SLA section in `SopStepPanel.tsx`, collapsed by default | `SopStepPanel.tsx:173` — `<SlaEscalationSection value={step} onChange={onUpdateStep} adapter={adapter} />`; collapsed by default in component's initial state | PASS |
| FR-010 | SLA toggle hides sub-fields when off | `SlaEscalationSection.tsx:119` — `{value.slaEnabled && ( … all sub-fields … )}` | PASS |
| FR-011 | Duration / Unit / Basis / Warning controls | `SlaEscalationSection.tsx:121–159` — all four fields present with correct field types and constraints | PASS |
| FR-012 | Escalation controls with conditional lookup | `SlaEscalationSection.tsx:160–234` — action, target type, and target-specific SearchableDropdown rendered conditionally | PASS |
| FR-013 | SLA summary badge on SOP step canvas node cards | `SopStepNodeData` does not carry SLA fields; `buildStepNode` does not pass them; `SopStepNode.tsx` has no badge rendering | **GAP — see G-1** |
| FR-014 | SLA validation on SOP steps; blocks save on violation | Panel inline errors: PASS (`SlaEscalationSection` calls `validateSlaConfig` on every render). Publish gate: MISSING (see G-2). Panel does not block individual field propagation — same design as process side. | **PARTIAL — see G-2** |
| FR-015 | `deriveProcessFromSop` copies SLA onto derived steps | `deriveProcessFromSop.ts:45` — `...copySlaFields(sopStep)` spread in `createStep` call; confirmed by live E2E; no automated unit test | PASS (code), **coverage gap — see G-3** |
| FR-016 | Inheritance is one-time snapshot; derived step is independently editable | `copySlaFields` returns a plain value copy; no reference or subscription. ADR-2b-002. | PASS |
| FR-017 | No default SLA applied at derivation beyond stored fields | `copySlaFields` is a direct field-to-field copy; `emptySlaFields()` is not called in the derivation path | PASS |
| FR-018 | SOP step SLA round-trips identically through save and reload | Live E2E: all 11 fields written and read back with correct codes on org5869857f | PASS |
| FR-019 | Derivation produces process steps with matching SLA fields | Live E2E included derivation and read-back of derived process steps | PASS |
| FR-020 | Backwards compat: SOP steps with null SLA load/save identically | `emptySlaFields()` defaults; `mapSlaFields({})` tested to return `emptySlaFields()`; live E2E confirmed null-SLA step behavior | PASS |

---

## Automated Test Coverage Assessment

### What is covered

**`slaStepFields.test.ts` (from this file, 36 assertions across 7 describe blocks):**

| Block | Tests | What they cover |
|---|---|---|
| `buildSlaBody` | 5 | undefined→{}, disabled→explicit nulls, enabled→correct codes, escalation off→null option fields, null warningPct |
| `mapSlaFields` | 2 | empty raw→emptySlaFields, full raw→typed values |
| `activeEscalationLookup` | 5 | user/team/role/ManagerOfAssignee/off |
| `slaSummaryText` | 4 | off→null, sla only, sla+escalation, null duration |
| `copySlaFields` | 2 | verbatim copy, non-SLA fields excluded |
| `buildEscalationBindPatches` | 4 | undefined→{}/0 calls, disabled→all-null, active-user→bind+null-others, empty-navprop→skip |
| option-set round-trip | 4 | all 4 global option sets code↔label invertible |

**`slaValidator.test.ts` (26 assertions):** Full boundary coverage of FR-014 validation rules — duration, unit, basis, warningPct, escalation action, target type, lookup fields, ManagerOfAssignee, SLA-off-escalation-on guard.

**`slaOptionCodes.test.ts` (4 assertions):** Cross-check between TypeScript code maps and provisioning script (GA-3 guard from DP-2 audit).

### Meaningful gaps in automated coverage

**G-3 — `deriveProcessFromSop.ts` inheritance copy (HIGH — Conditional release gate)**

There is no `deriveProcessFromSop.test.ts`. The function was changed on line 45 to spread `copySlaFields(sopStep)` into the `createStep` call. This is the core behavioral promise of DP-2b. The live E2E proved it works today; CI cannot prove it tomorrow.

Three specific scenarios that the architecture planned and that remain unautomated:

```
TC-DERIVE-01: SOP step with slaEnabled=true
Given: sopStep with slaDuration=3, slaDurationUnit='BusinessDays', escalationEnabled=true,
       escalationAction='Notify', escalationTargetType='ManagerOfAssignee'
When: deriveProcessFromSop is called (adapter.createStep spied)
Then: createStep spy's first call argument contains all SLA fields matching sopStep exactly
      (slaEnabled=true, slaDuration=3, slaDurationUnit='BusinessDays', ...)

TC-DERIVE-02: SOP step with slaEnabled=false
Given: sopStep with slaEnabled=false and all other SLA fields null
When: deriveProcessFromSop is called
Then: createStep receives slaEnabled=false and all 13 other SLA fields null

TC-DERIVE-03: Mixed SOP (2 SLA steps, 1 non-SLA step)
Given: SOP with 3 steps — steps[0] and steps[1] with SLA configured, steps[2] with SLA off
When: deriveProcessFromSop is called
Then: createStep call 1 and call 2 carry matching SLA; createStep call 3 has slaEnabled=false
```

Recommended file: `src/services/deriveProcessFromSop.test.ts`. Use `vi.fn()` for the adapter mock. Tests are pure — no Dataverse required.

**G-4 — `useSopSave.ts` SLA persistence wiring (MEDIUM)**

`useSopSave.ts` spreads `copySlaFields(step)` into `createSopStep` and `updateSopStep` calls (lines 87 and 99). No test exercises this path. A refactor that removed the spread would silently drop SLA from saves.

Recommended: `src/hooks/useSopSave.test.ts`. Two scenarios:
- A new SOP step (in `newIds`) with SLA fields set — spy on `adapter.createSopStep`, assert SLA fields in argument.
- A dirty existing SOP step with SLA enabled — spy on `adapter.updateSopStep`, assert SLA fields in argument.

**G-5 — `SopStepPanel.tsx` onChange wiring for SLA (LOW-MEDIUM)**

`SopStepPanel` passes `onChange={onUpdateStep}` to `SlaEscalationSection`. No component test verifies that toggling SLA → enabling duration → changing unit propagates the correct patch to `onUpdateStep`. The panel has no save button (immediate propagation pattern); this is the only place to test the wiring.

This is lower priority because the live E2E covers the end-to-end result, but a panel unit test would catch a regression in the `value`/`onChange` prop wiring cheaply.

---

## Findings

### G-1: FR-013 — Canvas SLA badge on SOP step nodes absent

Severity: Medium | Release-blocking: No | Confidence: 97%

`FR-013` and `US-04` require that SOP step node cards display an SLA summary badge (`"SLA: 3 Business Days | Escalate: Notify"`) when the step has SLA enabled. This is not implemented.

Evidence:

- `SopStepNodeData` interface (`sopSelectors.ts:12–23`) does not include `slaEnabled`, `slaDuration`, `slaDurationUnit`, `escalationEnabled`, or `escalationAction`.
- `buildStepNode` (`sopSelectors.ts:116–136`) does not pass any SLA fields into `data`.
- `SopStepNode.tsx` has no `slaSummaryText` call and renders no SLA badge.

The `SlaEscalationSection` collapsed header does display a badge (`slaSummaryText(value)`) within the side panel, but this is only visible when the step panel is open — not on the canvas node card itself.

US-04 priority is "Should Have". The primary must-have user journeys (US-01, US-02, US-03) are unaffected. The BA audit use case (US-04) degrades to requiring panel-open per step.

Recommendation: Defer to the next SOP engagement or resolve before Phase 6 if the team agrees the BA audit value justifies the cost. To implement: add `slaEnabled`, `slaDuration`, `slaDurationUnit`, `escalationEnabled`, `escalationAction` to `SopStepNodeData` + `buildStepNode`, then add a badge in `SopStepNode.tsx` using the existing `slaSummaryText` helper.

### G-2: FR-014 Partial — SOP publish gate does not validate SLA

Severity: Medium | Release-blocking: No | Confidence: 95%

DP-2 resolved its D-1 defect by adding `checkInvalidSlaConfig` to `ValidationService`, which runs on every canvas render and blocks the Publish action when a process step has `slaEnabled=true` but incomplete SLA configuration. The SOP side has no equivalent.

`validateSopForPublish` in `sopValidator.ts` (5 check functions, lines 5–15) does not call `validateSlaConfig`. A SOP step with `slaEnabled=true` and no duration can be published. Any process derived from it will inherit the incomplete SLA config, which will appear as an `INVALID_SLA` error in the process canvas (because `ValidationService.checkInvalidSlaConfig` does run there). The maker must then fix it in every derived process.

The panel-level inline validation is working — `SlaEscalationSection` shows field-level errors on every render. But these are advisory; they do not prevent the panel's immediate-propagation-on-change pattern from writing the incomplete config to the store, and the canvas Save button has no SLA gate on the SOP side.

This is asymmetric with DP-2. Whether to treat it as a requirement defect depends on interpretation of "block save" in FR-014:

- If "save" means individual field write: neither the process nor SOP side blocks this — by design.
- If "save" means canvas Save button: the process side does not block Save either (only Publish); the SOP side should match.
- If "save" includes Publish: the process side blocks Publish with `INVALID_SLA`; the SOP side does not.

Recommended fix: add an SLA validation check to `validateSopForPublish` in `sopValidator.ts`:

```typescript
import { validateSlaConfig } from '@/validators/slaValidator';

// inside validateSopForPublish, after existing checks:
results.push(...checkInvalidSlaConfigs(state));

function checkInvalidSlaConfigs(state: SopDesignerState): SopValidationResult[] {
  const results: SopValidationResult[] = [];
  for (const stepId of state.stepOrder) {
    const step = state.steps[stepId];
    if (!step?.slaEnabled) continue;
    const errors = validateSlaConfig(step);
    const firstError = Object.values(errors)[0];
    if (firstError) {
      results.push({
        code: 'VS-07',
        severity: 'error',
        affectedNodeId: stepId,
        message: `Step "${step.name || `#${step.sequenceNo}`}" has an incomplete SLA configuration: ${firstError}`,
      });
    }
  }
  return results;
}
```

This requires also extending `SopValidationResult.code` to include `'VS-07'`.

Acceptance: if the team accepts that the publish gate is a should-have not a must-have (analogous to how DP-2's D-1 was a defect that was then fixed), this should be remediated before Phase 6. If the team decides SLA is inert enough that an invalid publish is acceptable until CWFD-005, document the gap and defer.

### G-3: No automated test for `deriveProcessFromSop` SLA inheritance (described above)

Severity: High (coverage gap) | Release-blocking: Conditional | Confidence: 97%

The most important behavioral change in DP-2b — that derived process steps inherit SLA from SOP steps — has no automated regression test. The live E2E proved it once; CI does not catch a regression in this path.

This is the most important test to add before shipping. The three scenarios (TC-DERIVE-01 through TC-DERIVE-03 above) are cheap, pure, and would take one test file to implement.

**This is a conditional release gate.** The team should add `deriveProcessFromSop.test.ts` before merging. The implementation is correct (code inspection confirms the `copySlaFields` spread is in place), but shipping the core feature of an engagement with zero automated regression coverage for the derivation path is against Article IV (TDD) and raises the audit risk.

### G-4: No automated test for `useSopSave` SLA persistence wiring (described above)

Severity: Medium | Release-blocking: No | Confidence: 92%

Lower priority than G-3 because `useSopSave` is a thin wiring layer (it calls `copySlaFields(step)` and passes the result to the adapter), and the live E2E covered the save → reload round-trip. But the wiring is untested.

### G-5: No component test for `SopStepPanel` SLA wiring

Severity: Low | Release-blocking: No | Confidence: 95%

The panel directly passes `value={step}` and `onChange={onUpdateStep}` to `SlaEscalationSection`. React Testing Library mounting with a `vi.fn()` for `onUpdateStep` would verify the wiring in one test. Currently there are no `.test.tsx` files at all in the project, so this may require setting up a component testing environment first — which may be deferred to a follow-up.

---

## Edge Cases and Boundary Conditions

The following edge cases were assessed against the implementation. Items marked "covered" are handled correctly. Items marked "no test" are handled correctly in code but have no automated test verifying the behavior.

| Edge case | Handling | Test status |
|---|---|---|
| SLA enabled, duration = null | `validateSlaConfig` flags `slaDuration`; error shown inline | Covered: `slaValidator.test.ts` (`null` case in `it.each`) |
| SLA enabled, duration = 0 | Same as above — `isPositiveInteger(0)` = false | Covered: `slaValidator.test.ts` |
| SLA enabled, duration = 1.5 (fractional) | `isPositiveInteger(1.5)` = false (checks `Number.isInteger`) | Covered: `slaValidator.test.ts` |
| Warning pct = 0 / 100 / 101 | All flagged by `isInRange(value, 1, 99)` | Covered: `slaValidator.test.ts` |
| Warning pct = 1 / 50 / 99 | All accepted | Covered: `slaValidator.test.ts` |
| Escalation enabled, target = ManagerOfAssignee, no lookup | No error for missing lookup — by design (BR-006) | Covered: `slaValidator.test.ts` |
| Escalation enabled without SLA enabled | `escalationEnabled` error emitted | Covered: `slaValidator.test.ts` |
| `buildEscalationBindPatches` called with `slaEnabled=undefined` | Returns `{}`, resolveNavProp never called (R-2 guard) | Covered: `slaStepFields.test.ts` |
| `buildEscalationBindPatches` called with `slaEnabled=false` | All three lookup nav-props set to null | Covered: `slaStepFields.test.ts` |
| `buildEscalationBindPatches` when resolveNavProp returns empty string | Lookup skipped (no empty-key patch written) | Covered: `slaStepFields.test.ts` |
| `copySlaFields` called with non-SLA fields on source | Non-SLA fields excluded from return value | Covered: `slaStepFields.test.ts` |
| SOP step with `slaBasis = 'PreviousStepCompleted'` loaded from Dataverse | `mapSlaFields` correctly maps code 100000002 → 'PreviousStepCompleted'; `buildSlaBody` correctly writes it back. The UI `BASIS_OPTIONS` omits 'PreviousStepCompleted', so the `Select` control renders blank for this value — display-only confusion, not data corruption. | No test; Low severity |
| Mixed SOP derivation (SLA on + SLA off steps) | `copySlaFields` on SLA-off step returns `emptySlaFields()` equivalent; `buildSlaBody` writes explicit nulls | No automated test — **see G-3** |
| Backward compat: old SOP step with all SLA fields null | `mapSlaFields({})` returns `emptySlaFields()`; store carries defaults; save writes nothing for SLA fields (because `buildSlaBody` receives `slaEnabled=false` → clears) | Covered: `mapSlaFields` test + live E2E |
| `SlaEscalationSection` with `disabled=true` | `patch()` function short-circuits (`if (!disabled) onChange(fields)`) | Not wired in current `SopStepPanel` — intentional per known decisions; no test needed |
| Option set code not in inverse map (unknown code from Dataverse) | `fromCode(map, raw)` returns `null` (safe default) | Covered implicitly: `mapSlaFields` test passes through unknown codes as null |

---

## Intentional Decisions — Confirmed Not Defects

The following items were reviewed and confirmed as deliberate decisions per the engagement brief. They are not raised as defects.

1. **SLA section not read-only on published SOPs** (`disabled` prop not passed). The SOP panel applies no field-level lock to any field when the SOP is published; making only the SLA section read-only would be inconsistent. The architecture's OQ-3 recommendation was superseded by this consistency choice. US-04 AC "No SLA field is editable when in published state" is therefore partially unmet by design. Follow-up: when the SOP panel gets a published-lock mechanism for all fields, the `disabled` prop on `SlaEscalationSection` should be wired.

2. **`copySlaFields` is a snapshot, not a live link** (ADR-2b-002). Updating a SOP template's SLA after derivation does not affect already-derived processes. BR-003.

3. **In-wizard SLA override is not implemented** (OQ-4 resolution — post-derivation editing via DP-2 panel is sufficient).

4. **`PreviousStepCompleted` omitted from UI `BASIS_OPTIONS`** (CEO decision). Schema still carries the code; tooltip approach was replaced with omission. Data integrity is preserved: if the code is set externally, `mapSlaFields` maps it correctly and `buildSlaBody` writes it back; the UI just renders a blank select.

5. **No bundle-size measurement recorded.** Architecture NFR-009 sets 10 KB limit. Measuring delta falls to Phase 6 audit if required.

---

## Performance Benchmarks

This engagement adds design-time configuration UI only. No new API surface, no new Dataverse entities other than the 11 fields and 3 relationships. No specific performance benchmarks are defined beyond:

- `createSopStep` with SLA fields: two additional awaited calls (`buildSlaBody` is synchronous; `buildEscalationBindPatches` awaits `resolveNavProp` × 3). `resolveNavProp` is session-cached (per DP-2 EG-1 resolution); the three nav-prop calls are effectively instant after the first resolution per entity.
- Derivation: each `createStep` call in the loop now carries 14 extra fields in the body. No additional network calls per step. Impact is negligible.

---

## Definition of Done Checklist

- [x] 88 vitest tests green (tsc clean, prod build green)
- [x] FR-001 through FR-012: all verified by code inspection + live E2E
- [x] FR-015 through FR-020: all verified by code inspection + live E2E
- [x] Shared module (`slaStepFields.ts`) unit-tested including `copySlaFields` and `buildEscalationBindPatches`
- [x] Option-set codes cross-checked: TS constants match provisioning script (slaOptionCodes.test.ts)
- [x] Live E2E round-trip on org5869857f: 11 fields created, read-back, R-2 null-clear
- [x] Backwards compat: null-SLA steps confirmed
- [x] No new npm dependencies
- [x] No hardcoded option codes in application code
- [x] ADR-2b-001 (component generalization) correctly implemented
- [x] ADR-2b-002 (copy-not-link) correctly implemented
- [x] ADR-2b-003 (separate OTM relationships for sopstep lookups) resolved via runtime nav-prop resolution
- [ ] **G-3: `deriveProcessFromSop.test.ts` with TC-DERIVE-01/02/03** — MISSING (conditional release gate)
- [ ] **G-2: SOP publish gate SLA validation** — MISSING (should-have)
- [ ] **G-1: FR-013 canvas SLA badge** — MISSING (deferred; US-04 is Should Have)

---

## Gate Verdict

**CONDITIONAL PASS**

The core delivery is sound. The type contract, adapter wiring, shared module, validation, save hook, and derivation copy all read correctly and the live E2E proves the round-trip end-to-end. The test suite for the shared layer is thorough.

**Conditions before Phase 6 (Audit) proceeds:**

**C-1 (Required before merge): Add `deriveProcessFromSop.test.ts`.**
The inheritance copy is the defining behavioral promise of DP-2b and has zero automated regression coverage. The three scenarios (TC-DERIVE-01 through TC-DERIVE-03) are a 60–80 line pure vitest file. This is cheap, high-value, and directly required by Article IV (TDD). Shipping without it creates an un-guarded regression path for the engagement's primary feature.

**C-2 (Recommended, not a hard gate): Add SOP publish-gate SLA validation.**
`validateSopForPublish` should mirror the DP-2 D-1 fix. A SOP with invalid SLA config (slaEnabled=true, no duration) can be published today; derived processes will show `INVALID_SLA` canvas errors that the maker must fix manually per process. Adding VS-07 to `validateSopForPublish` is a small, isolated change (one new private function, ~15 lines). If the team elects to defer, document the asymmetry with DP-2 in a known-gaps register.

**C-3 (Deferred, track): FR-013 canvas badge.**
`SopStepNodeData` and `buildStepNode` need SLA field pass-through; `SopStepNode.tsx` needs the badge. US-04 "Should Have" — does not block phase gate but should be tracked for the next SOP canvas engagement.

---

## Condition Resolution (build engineer, 2026-07-22)

- **C-1 — RESOLVED.** Added `src/services/deriveProcessFromSop.test.ts` (3 tests): full SLA copy,
  disabled-SLA propagates as `emptySlaFields()` defaults, and mixed SOP (per-step inheritance).
  Pure vitest, no Dataverse. Regression coverage for the DP-2b core promise now in CI.
- **C-2 — RESOLVED.** Added `checkInvalidSlaConfig` (VS-07) to `validateSopForPublish` in
  `src/validators/sopValidator.ts`, reusing the process-side `validateSlaConfig`. A SOP step with
  SLA enabled but incomplete config now blocks Publish, symmetric with DP-2's INVALID_SLA gate.
  Covered by `src/validators/sopValidator.test.ts` (3 tests).
- **C-3 — DEFERRED / TRACKED.** FR-013 SOP-canvas SLA badge (US-04 "Should Have") not implemented;
  tracked as a follow-up for the next SOP-canvas engagement (parity with DP-2's edit-canvas badge).
  SLA config is inert until CWFD-005, and the SOP StepPropertiesPanel already surfaces the config,
  so the missing canvas badge is a discoverability nicety, not a correctness gap.

**Post-fix state:** tsc clean; **94 tests** green (was 88; +3 derivation, +3 SOP validator); build green.
