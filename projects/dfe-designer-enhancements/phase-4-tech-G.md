# DFE-ENH-001 — Phase 4 Workstream G: FR-012(a) Form Code Auto-Derive Fix

## Summary

Workstream G delivers the Form Code dirty-flag fix specified in FR-012(a).
Branch: `feat/dfe-enh-codefix`
Base: `origin/main` @ `409ecd30`

---

## Root Cause

`StepFormBasics.handleNameChange` used the guard expression `state.code || autoCode` to decide
whether to update the Code field when the Name changed. Because this guard tests the truthiness
of `state.code` (non-empty string = truthy), the following race occurred:

1. User types the first character in the Name field.
2. `autoCode` is derived (e.g. `"l"` for the letter "L").
3. `onChange({ name: ..., code: "l" })` is dispatched — Code is now non-empty.
4. User types the second character. `state.code = "l"` is truthy, so `"l" || "lo"` evaluates
   to `"l"` — the Code field stops updating and gets stuck on the first derived character.
5. The user, seeing a single-character Code, manually appends more text. The result is
   a Code that combines the stuck auto-derived prefix with the user's suffix (e.g. `ee2e_qa_test`).

The condition intended to mean "if the user has already typed something, keep it", but it
triggered immediately after the first auto-derive, defeating the intent entirely.

---

## Fix

### New utility module — `src/utils/formCodeUtils.ts`

Two pure functions extracted from inline lambdas:

| Function | Purpose |
|---|---|
| `slugifyFormCode(name)` | Derives a URL-safe code from a Form Name: lowercase → collapse non-alphanumeric sequences to `-` → strip leading/trailing hyphens → truncate at 50 chars |
| `sanitizeFormCode(rawCode)` | Per-keystroke sanitization when the user types directly in the Code field: lowercase → replace every disallowed char with `-` (no collapsing — user controls spacing) |

The slug algorithm changes the separator from underscore to hyphen, matching the BA acceptance
criteria example (`"Loan Application Form"` → `"loan-application-form"`).

### Dirty-flag pattern — `NewFormWizardScreen.tsx`

A new `isFormCodeManuallyEdited: boolean` state variable (initialized `false`) lives in the
parent `NewFormWizardScreen` component. It is never reset to `false` within a session —
once the user takes ownership of the Code field, they own it for the rest of the wizard.

`StepFormBasics` receives two new props:

```typescript
interface StepFormBasicsProps {
  // ...existing props...
  isCodeLocked: boolean;
  onCodeManuallyEdited: () => void;
}
```

`handleNameChange` branches on the flag:

```typescript
if (isCodeLocked) {
  onChange({ name: data.value });           // Code untouched
} else {
  onChange({ name: data.value, code: slugifyFormCode(data.value) }); // Auto-derive
}
```

`handleCodeChange` sets the flag permanently before dispatching the sanitized value:

```typescript
onCodeManuallyEdited();                           // flip the flag in the parent
onChange({ code: sanitizeFormCode(data.value) }); // sanitize what the user typed
```

The flag lives in the parent rather than in a `useRef` inside `StepFormBasics` because
the component unmounts when the user navigates from step 1 to step 2 and back — a `useRef`
would reset to `false` on remount, silently re-enabling auto-derive after a Back navigation.

---

## Tests

### `tests/utils/formCodeUtils.test.ts` — 16 unit tests

Pure function tests for `slugifyFormCode` and `sanitizeFormCode`. No mocks required.
Covers: lowercasing, space-to-hyphen, sequence collapsing, leading/trailing strip,
preservation of existing hyphens, 50-char truncation, empty and whitespace-only inputs,
manual input sanitization (legacy underscores become hyphens).

### `tests/screens/NewFormWizardScreen.test.tsx` — 5 integration tests

RTL + Fluent UI provider + mocked `useDesignerStore`. Covers:

| Test | Scenario |
|---|---|
| `auto_derives_code_from_name_before_manual_edit` | Typing "Loan Application Form" produces "loan-application-form" |
| `continues_updating_code_as_name_grows_while_unedited` | Each additional character updates the code until the flag is set |
| `stops_auto_deriving_after_user_manually_edits_code` | After clearing + retyping the Code field, Name changes no longer mutate it |
| `sanitizes_disallowed_characters_in_manual_code_input` | Typing "MY FORM!" into Code produces "my-form-" |
| `sanitizes_auto_derived_code_with_special_characters_in_name` | "Loan (2026) Form" → "loan-2026-form" |

---

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` (worktree with workspace node_modules junctions) | 0 errors |
| `vitest run formCodeUtils.test.ts NewFormWizardScreen.test.tsx` | 21/21 passed |

---

## Changed Files

| File | Change type |
|---|---|
| `projects/dynamic-form-engine/designer/src/utils/formCodeUtils.ts` | New — slug + sanitize utilities |
| `projects/dynamic-form-engine/designer/src/screens/NewFormWizardScreen.tsx` | Modified — dirty-flag, new props, updated handlers |
| `projects/dynamic-form-engine/designer/tests/utils/formCodeUtils.test.ts` | New — unit tests |
| `projects/dynamic-form-engine/designer/tests/screens/NewFormWizardScreen.test.tsx` | New — integration tests |
