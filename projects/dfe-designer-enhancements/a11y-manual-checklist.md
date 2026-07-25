# DFE Designer — WCAG 2.1 AA Manual Accessibility Checklist

**Engagement ID:** DFE-ENH-001
**Requirement:** ENT-008
**Standard:** WCAG 2.1 Level AA
**Cleared conditions:** C-001 — QDB internal Accessibility Officer designated as sign-off authority
**Scope:** AA (not AAA). Manual checks complement the automated axe-core scan.
**Platforms:** NVDA + Chrome (Windows 11) | VoiceOver + Safari (macOS 14+)
**Status:** PENDING SIGN-OFF — complete the automated scan (F4) before conducting manual checks

---

## How to Use This Checklist

1. Run the automated axe-core scan first (Layer 1: `npm run test:e2e`; Layer 2: `npm run test:a11y`).
2. Confirm zero automated violations before proceeding to manual checks.
3. Conduct each manual scenario on both NVDA (Windows) and VoiceOver (macOS).
4. Mark each item PASS, FAIL, or N/A with your initials and the date.
5. Document any FAIL with: WCAG criterion, symptom, affected component, reproduction steps.
6. Forward the completed checklist to the QDB Accessibility Officer for co-sign.

---

## Section 1 — Single-Step Rendered Form

Target: A DFE-rendered single-step form containing text, dropdown, date, and required fields.
Navigate to the form URL in the portal, activate NVDA/VoiceOver, and work through each check.

| # | WCAG Criterion | Test Step | Expected Outcome | NVDA Result | VoiceOver Result |
|---|---|---|---|---|---|
| 1.1 | 1.3.1 Info and Relationships | Navigate by heading | Headings structure the page logically; form sections are identified as regions | | |
| 1.2 | 1.3.1 Info and Relationships | Navigate by form elements | All form inputs are associated with their labels; required indicator is programmatic | | |
| 1.3 | 1.4.3 Contrast (Minimum) | Inspect field labels, placeholder text, error messages | Label: ≥ 4.5:1 contrast; placeholder: ≥ 3:1; error text: ≥ 4.5:1 | N/A — visual check | N/A — visual check |
| 1.4 | 2.1.1 Keyboard | Tab through all fields | All fields reachable by Tab; no keyboard trap | | |
| 1.5 | 2.4.3 Focus Order | Tab forward and backward | Focus order is logical (top-to-bottom, left-to-right); follows visual layout | | |
| 1.6 | 2.4.7 Focus Visible | Tab to each interactive element | Visible focus indicator on every focused element | N/A — visual check | N/A — visual check |
| 1.7 | 3.3.1 Error Identification | Submit form with required field empty | Error message announced when focus moves to error summary or field | | |
| 1.8 | 3.3.2 Labels or Instructions | Check every field | Every field has a visible label; required fields additionally indicate "required" | | |
| 1.9 | 4.1.2 Name, Role, Value | Inspect required switch/checkbox fields | Screen reader announces: field name, type (checkbox/switch), state (checked/unchecked), required | | |
| 1.10 | 4.1.3 Status Messages | Submit form successfully | Success message is announced without moving focus | | |

---

## Section 2 — Multi-Step Rendered Form

Target: A DFE-rendered multi-step (tabbed) form with at least two steps and a progress indicator.

| # | WCAG Criterion | Test Step | Expected Outcome | NVDA Result | VoiceOver Result |
|---|---|---|---|---|---|
| 2.1 | 1.3.1 Info and Relationships | Navigate to step indicator | Step indicator (tab bar) has role="tablist"; each step has role="tab" with aria-selected | | |
| 2.2 | 2.4.3 Focus Order | Activate "Next" button, observe focus | Focus moves to the new step's first field or step heading | | |
| 2.3 | 2.4.6 Headings and Labels | Navigate by heading on each step | Each step has a unique heading at the appropriate level | | |
| 2.4 | 4.1.2 Name, Role, Value | Navigate step tabs | Tab announces: step name, current/total position, selected state (e.g. "Step 2 of 4, tab, selected") | | |
| 2.5 | 3.2.2 On Input | Change tab via keyboard | Changing tab/step does not unexpectedly submit the form | | |
| 2.6 | 2.1.1 Keyboard | Navigate "Previous" / "Next" buttons | Both buttons reachable and activatable by keyboard alone | | |

---

## Section 3 — RTL Arabic Form

Target: A DFE-rendered form with the Arabic locale active (RTL layout).

| # | WCAG Criterion | Test Step | Expected Outcome | NVDA Result | VoiceOver Result |
|---|---|---|---|---|---|
| 3.1 | 1.3.2 Meaningful Sequence | Tab through fields in RTL mode | Tab order follows the visual right-to-left reading order | | |
| 3.2 | 1.3.4 Orientation | Rotate device / resize viewport | Form reflows correctly in both portrait and landscape; no horizontal scroll | | |
| 3.3 | 1.4.10 Reflow | Zoom to 400% | No content is clipped or lost; horizontal scroll is not required | | |
| 3.4 | 4.1.2 Name, Role, Value | Navigate Arabic field labels | Screen reader announces the Arabic label, not the English fallback | | |
| 3.5 | 3.3.1 Error Identification | Submit with validation error in Arabic locale | Error message appears in Arabic; announced in Arabic language voice if available | | |

---

## Section 4 — Designer Canvas (Authoring UI)

Target: The DFE Form Designer canvas as experienced by form administrators.

| # | WCAG Criterion | Test Step | Expected Outcome | NVDA Result | VoiceOver Result |
|---|---|---|---|---|---|
| 4.1 | 2.1.1 Keyboard | Open designer without mouse | All drag-and-drop actions reachable via Alt+Up / Alt+Down (FR-009) | | |
| 4.2 | 4.1.2 Name, Role, Value | Focus a drag handle | Screen reader announces: "Drag handle for [Field Name]. Press Space to pick up." | | |
| 4.3 | 1.4.13 Content on Hover or Focus | Hover over toolbox item | Tooltip content persists while pointer is over it; dismissible by Escape | | |
| 4.4 | 2.4.3 Focus Order | Tab through the designer toolbar | All toolbar buttons reached in a logical order before canvas content | | |
| 4.5 | 4.1.3 Status Messages | Drag-drop field to new position | ARIA live region announces: "Moved [Field Name] to position N in [Section Name]" | | |
| 4.6 | 2.1.2 No Keyboard Trap | Open any modal dialog | Focus is trapped inside the dialog; Tab cycles within; Escape closes and returns focus | | |
| 4.7 | 3.3.1 Error Identification | Linting panel shows errors | Linting error count announced on update; clicking a result moves focus to the affected field | | |
| 4.8 | 1.4.3 Contrast (Minimum) | Inspect designer panels, buttons, labels | All text and interactive elements meet 4.5:1 (normal) or 3:1 (large text / UI component) | N/A — visual | N/A — visual |

---

## Section 5 — Conflict Resolution Dialog

Target: The `ConflictResolutionDialog` component (FR-001), opened when a save conflict is detected.

| # | WCAG Criterion | Test Step | Expected Outcome | NVDA Result | VoiceOver Result |
|---|---|---|---|---|---|
| 5.1 | 1.3.1 Info and Relationships | Open conflict dialog | Dialog has role="alertdialog"; aria-modal="true"; aria-labelledby references the heading | | |
| 5.2 | 2.1.2 No Keyboard Trap | Tab through dialog | Focus is trapped inside the dialog; Tab cycles through: "Review", "Reload", "Keep editing" | | |
| 5.3 | 4.1.3 Status Messages | Dialog opens | ARIA live region announces: "Save conflict — your changes were not saved" immediately on open | | |
| 5.4 | 2.4.3 Focus Order | Dialog opens | Initial focus moves to the dialog heading or the first actionable button | | |
| 5.5 | 2.1.1 Keyboard | Dismiss dialog with Escape | Pressing Escape activates "Keep editing" and returns focus to the trigger element | | |

---

## Section 6 — Timeout and Session Management

Target: Any DFE form or designer session where a session-expiry or auto-save feature is active.
Verify that timing restrictions are adjustable and that status announcements reach assistive technology
without moving keyboard focus (WCAG 2.2.1 Timing Adjustable; WCAG 4.1.3 Status Messages).

| # | WCAG Criterion | Test Step | Expected Outcome | NVDA Result | VoiceOver Result |
|---|---|---|---|---|---|
| 6.1 | 2.2.1 Timing Adjustable | Wait until the session-expiry warning appears (or trigger it by fast-forwarding the timer in dev tools) | Warning displays at least 20 seconds before expiry; user can extend the session via a keyboard-accessible control without the extension action itself timing out; no content is lost | | |
| 6.2 | 2.2.1 Timing Adjustable | Allow the session to expire without interaction | User was warned in advance and offered a way to extend; on expiry, the screen reader announces the session ended; previously entered data is preserved or recoverable via a server-side draft | | |
| 6.3 | 4.1.3 Status Messages | Observe the session-expiry warning as it appears | Warning is announced immediately by the screen reader via `aria-live="assertive"` (or `role="alert"`) without moving focus away from the current field | | |
| 6.4 | 4.1.3 Status Messages | Trigger an auto-save and observe the confirmation | "Draft saved" or "Save failed" message is announced via `aria-live="polite"` without disrupting the user's current position in the form | | |

---

## Sign-Off

| Role | Name | Date | Signature |
|---|---|---|---|
| QDB Accessibility Officer | | | |
| Maqsad AI Frontend Lead | | | |

**QDB Accessibility Officer statement (to be completed):**

> "I have reviewed the axe-core automated scan report (F4 scan inventory) and the manual
> accessibility test results documented above. I confirm that the DFE Form Designer and its
> rendered forms meet / do not yet meet WCAG 2.1 Level AA as of the date above, and that all
> outstanding violations identified in the F4 inventory are tracked in the F5 remediation
> workstream with an agreed completion date."

---

## Reference Standards

| Code | Document |
|---|---|
| WCAG 2.1 | https://www.w3.org/TR/WCAG21/ |
| Qatar E-Gov Accessibility | aligned to WCAG 2.1 AA |
| ARIA Authoring Practices | https://www.w3.org/WAI/ARIA/apg/ |
| axe-core rules | https://dequeuniversity.com/rules/axe/4.10 |

---

*Generated by DFE-ENH-001 Phase 4 Workstream F (ENT-008). Last updated: 2026-07-10.*
