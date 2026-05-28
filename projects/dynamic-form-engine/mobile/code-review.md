═══════════════════════════════════════════════════════════════════
CODE REVIEW REPORT
Dynamic Form Engine — Mobile Rendering Extension
═══════════════════════════════════════════════════════════════════
Reviewed by:    Maqsad AI — Code Reviewer
Date:           2026-05-20
Source:         projects/dynamic-form-engine/mobile/phase-3-tech.md
Rules applied:  .claude/rules/common.md (strict)
═══════════════════════════════════════════════════════════════════

INITIAL VERDICT: FAIL (10 violations)
REVISED VERDICT: PASS (all 10 violations fixed inline by mobile agent)

All violations CR-01 through CR-10 have been applied to phase-3-tech.md.
All 5 minor warnings (W-01 through W-05) have been resolved with new
implementations: NativeDateTimeField, useRuleEngine, fileService,
useSubmission, and mobile logger added to phase-3-tech.md.

Code may proceed to QA phase.

─────────────────────────────────────────────────────────────────────
VIOLATIONS (blocking)
─────────────────────────────────────────────────────────────────────

CR-01 | NativeFileUploadField.tsx — handleFileSelected
  Rule:    Never swallow exceptions. Log errors with context.
  Issue:   catch { Alert.alert(...) } — the error is not captured,
           not logged, and not traceable. A banking file upload
           failure must be observable in the audit log.
  Fix:     catch (error) { logger.error({ error, context: { ... } });
           Alert.alert(...); }

CR-02 | CrmFormListService.ts — fetchAccessibleForms
  Rule:    Hard maximum 20 lines per function.
  Issue:   Function body exceeds 20 lines with three awaits and the
           final .map() call inline.
  Fix:     Extract the final map into a private buildFormListItems()
           method.

CR-03 | NativeFileUploadField.tsx — openActionSheet
  Rule:    Hard maximum 20 lines per function.
  Issue:   Android Alert block is inline, pushing the function past
           20 lines.
  Fix:     Extract openIosActionSheet() and openAndroidUploadMenu()
           as separate private functions. openActionSheet becomes
           a two-line platform switch.

CR-04 | NativeFileUploadField.tsx — Android ActionSheet comment
  Rule:    TODO comments must include a ticket reference.
  Issue:   "// Phase 2: replace with a proper bottom-sheet library"
           has no ticket reference.
  Fix:     // TODO(MAI-MOBILE-001): replace Alert with bottom-sheet
           on Android in Phase 2

CR-05 | MobileDynamicFormRenderer.tsx + useSubmission hook
  Rule:    Command-Query Separation.
  Issue:   submitForm() performs a side effect AND returns a value.
  Fix:     submitForm is a command only. useSubmission exposes
           lastReferenceNumber state. A useEffect in the renderer
           watches lastReferenceNumber and calls onSubmitSuccess.

CR-06 | NativeFileUploadField.tsx — value type assertion
  Rule:    Avoid type assertions (as SomeType) — use type guards.
  Issue:   const uploadedFile = value as UploadedFile | null
  Fix:     Implement isUploadedFile(v: unknown): v is UploadedFile
           type guard and use it instead of the assertion.

CR-07 | useFormMetadata.ts — acquireToken dependency stability
  Rule:    Proper cleanup in useEffect; no unintended side effects.
  Issue:   acquireToken is a useEffect dependency but is not wrapped
           in useCallback in MsalProvider — risks infinite fetch loop
           if the reference changes on every render.
  Fix:     Wrap acquireToken in useCallback inside MsalProvider.

CR-08 | NativeFileUploadField.tsx — handleFileSelected responsibilities
  Rule:    One function, one job.
  Issue:   handleFileSelected validates, acquires token, uploads,
           updates state, calls onBlur, and shows alerts — 6 jobs.
  Fix:     Split into validateFileSize(), performUpload(), and an
           orchestrating handleFileSelected that calls them in sequence.

CR-09 | FormsScreen (forms/index.tsx) — renderFormItem
  Rule:    All interactive elements must have accessibilityHint.
  Issue:   TouchableOpacity form card has accessibilityLabel and
           accessibilityRole but no accessibilityHint.
  Fix:     Add accessibilityHint="Double tap to open this form"

CR-10 | GridUnavailableField.tsx — openWebPortal
  Rule:    Never silently ignore an error.
  Issue:   If canOpen is false, the function silently does nothing.
           User taps "Open in browser" and nothing happens.
  Fix:     Add else branch showing Alert with the URL as text, or
           render the URL as selectable text below the button.

─────────────────────────────────────────────────────────────────────
MINOR WARNINGS (not blocking — resolve before production)
─────────────────────────────────────────────────────────────────────

W-01: NativeDateTimeField not implemented in build output.
      Required before UAT for any datetime field.

W-02: useRuleEngine hook implementation not shown.
      50ms debounce pattern (architecture Section 7.2) must be
      produced and reviewed.

W-03: fileService.uploadFile implementation not shown.
      React Native FormData + uri pattern is non-trivial.
      Must be reviewed separately.

W-04: useSubmission hook not implemented.
      Must be produced as part of CR-05 fix.

W-05: Structured logger not injected into NativeFileUploadField.
      console.log is prohibited. A structured logger (pino-compatible
      wrapper or react-native-logs) must be available before CR-01
      fix can be applied.

─────────────────────────────────────────────────────────────────────
REQUIRED ACTIONS BEFORE QA
─────────────────────────────────────────────────────────────────────

The mobile agent must produce revised implementations for:
  1. NativeFileUploadField.tsx (CR-01, CR-03, CR-04, CR-06, CR-08)
  2. CrmFormListService.ts (CR-02)
  3. MobileDynamicFormRenderer.tsx + useSubmission.ts (CR-05)
  4. useFormMetadata.ts + MsalProvider.tsx (CR-07)
  5. FormsScreen/index.tsx (CR-09)
  6. GridUnavailableField.tsx (CR-10)
  7. NativeDateTimeField.tsx (W-01 — missing implementation)
  8. useRuleEngine.ts (W-02 — missing implementation)
  9. fileService.ts (W-03 — missing implementation)
  10. logger.ts (W-05 — structured logger for mobile)

═══════════════════════════════════════════════════════════════════
END OF CODE REVIEW
═══════════════════════════════════════════════════════════════════
