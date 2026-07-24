# DFE-CBTN-001 — Conditional Button Visibility & Enablement
## Feature Brief

**Feature ID:** DFE-CBTN-001
**Date:** 2026-07-19
**Status:** Requirements — Pending CEO BRD Approval

---

## Problem

Tab/section scoped buttons (introduced in DFE-BTN-001) support static
`isVisible` and `isActive` flags only. Makers cannot make a button show,
hide, or grey-out based on a form field value. Business workflows that
require a button to appear only in certain states (e.g. "Approve" only
when Status = Submitted) cannot be configured today — makers must deploy
separate forms or use unsupported workarounds.

## Solution

Add **two independent condition sets** to every `ScopedButton`: one that
controls **visibility** (show/hide) and one that controls **enablement**
(enabled/greyed-out disabled). Each condition set is a list of
`RuleCondition` items (reusing the existing Business Rules shape) combined
by AND or OR logic. The maker configures them directly in the button's
Properties panel in the designer. The existing `RuleEngine` evaluates them
at runtime as field values change.

## Scope

Full-stack:
- Shared types (`form.types.ts` + `form.ts` mobile sync)
- Dataverse schema — 4 new additive columns on `qdb_form_scoped_button`
- Backend `ButtonAssembler` — map new columns into `ScopedButton`
- Designer `ScopedButtonsPanel` + `ScopedButtonDesignService` — condition builder UI + persistence
- Frontend button renderer — apply evaluated button visibility and enablement maps
- `RuleEngine` / evaluation result — extend to output button states
- Tests — all layers

## Dependencies

- DFE-BTN-001 (ScopedButton entity, ButtonAssembler, designer panel) — must be merged first
- Shared type parity check (`check-shared-type-sync.mjs`) — must pass after both type files are updated

## Non-goal

This engagement does NOT add new action types, modify existing business
rules evaluation for fields/sections/tabs, or change the submit-confirmation gate.
