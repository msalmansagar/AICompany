# BRD Addendum B — Survey mode in the Form Designer (CSE-ENG-001)

| | |
|---|---|
| Prepared by | MSS Technologies, Business Analyst |
| Amends | `phase-2-ba.md` v1.2 (v1.1 + Addendum A) → becomes v1.3 |
| Date | 2026-11-13 |
| Status | **APPROVED by the CEO (user), 2026-11-13.** BRD becomes v1.3. |
| Trigger | CEO request, 2026-11-13: "Once I click on new form then 2 options should appear. Like Normal Form or Survey. Once user will select Survey then in the designer only show Survey related options and controls." |

## 1. Why this addendum exists

FR-CSE-020 lets a survey use **any** question type the designer supports. A code review of the designer, the
survey runtime and the submit API (2026-11-13) found seven controls whose answers a survey loses or stores in a
form an analyst cannot read:

| Control | What happens to the answer in a survey |
|---|---|
| Lookup, Multi-select Lookup | Stored as a JSON blob `{id, displayName}`; a portal customer cannot search CRM records |
| File Upload | The file becomes a CRM note with no parent record; the answer is a JSON blob |
| Rich Text | Stored as raw HTML markup |
| Repeating Grid, Interactive Grid | Each row is a JSON blob; the survey path never writes child records |
| Custom Component | Depends on the component; usually an object stored as JSON |

Several form settings also have no effect on a survey, or break it: Target CRM Entity and the Mapping screen
(the survey path writes Responses and Answers, never the entity), **Save as Draft** (the in-CRM runtime throws when
a customer presses Draft), Power Automate Flow ID, Reference Number attribute and Access Group.

Narrowing the question types changes what FR-CSE-020 promises, so it needs this addendum.

## 2. What changes

| Area | Change |
|---|---|
| FR-CSE-020 | **Amend** "using any question type the designer supports" to "using the survey question types (FR-CSE-072)". |
| Section 4.3 Group C | **Add** FR-CSE-071 to FR-CSE-075 below. |

## 3. Functional requirements (Group C additions)

| ID | Requirement | Acceptance criteria | Priority |
|---|---|---|---|
| FR-CSE-071 | **New Form** shall first ask the maker to choose **Normal Form** or **Survey**. Choosing Survey creates the form with Form Type = Survey, proposes a code with the `srv_` prefix, skips the Target CRM Entity step and creates the form with Save as Draft off. Choosing Normal Form creates exactly the form the wizard creates today. On an org without the Form Type column, Survey cannot be chosen and says why. | A maker who picks Survey and names the form "Customer Feedback" gets code `srv_customer-feedback` (hyphens are the org's form-code convention), Form Type = Survey and Save as Draft off, and is never asked for a target table. A maker who picks Normal Form gets today's form, field for field. | Must |
| FR-CSE-072 | In a Survey form the designer palette shall offer only the **survey question types**: text, multi-line text, dropdown, radio (including its star and other render styles), multi-select, number, decimal, currency, Yes/No, checkbox, date, date & time, email, phone, plus label, info banner and every layout element (tabs/pages, sections, spacer, divider, headings). Lookup, Multi-select Lookup, File Upload, Rich Text, Repeating Grid, Interactive Grid and Custom Component are not offered. Normal forms keep every control. | A Survey form's palette shows no Lookup, File Upload, Rich Text, grid or Custom Component; a Normal form's palette is unchanged. | Must |
| FR-CSE-073 | In a Survey form the designer shall hide the settings a survey does not use: Target CRM Entity, Save as Draft and Draft Expiry, Power Automate Flow ID, Reference Number Attribute, Access Group, the field CRM-mapping button and the Mapping command, and the number "bar" display style (it collects no answer). Every other setting stays, including Scoring, Points and Weights, and the designer's own **Save Draft** command (it saves the form design, not a customer draft). | None of the listed settings appears on a Survey form; all of them still appear on a Normal form. | Must |
| FR-CSE-074 | Publishing a Survey form shall be refused while it contains a control that is not a survey question type (FR-CSE-072), naming each one. A survey shall not be required to have a target table or a required field. | A survey that was switched from Normal and still holds a Lookup is refused with the Lookup's label named. A survey with no target table and no required field publishes. | Must |
| FR-CSE-075 | **Cloning** a Survey form shall produce a Survey form (Form Type = Survey, `srv_` code, Save as Draft off). Form Type stays changeable in form properties; switching a **published** survey to Normal shall warn first that the form can no longer be sent as a survey (responses already collected are unaffected). | A cloned survey opens as a survey and publishes. Switching a published survey to Normal shows the warning; cancelling keeps it a survey. | Must |

## 4. Constraints kept

- **C-6 / NFR-CSE-010:** every change is conditional on Form Type = Survey. Normal forms keep every control and
  setting, and their saved and published output is unchanged (FR-CSE-025 regression gate). The only visible change
  for a Normal form is the extra first choice in New Form.
- **No schema change.** Designer only; the survey runtime and the C# publisher are untouched.
- **On-prem:** a new designer build replaces 1.5.0 in the on-prem kit `onprem-deploy/2026-11-11/` (not yet imported
  on either org, so nothing is re-imported).

## 5. Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO | The user | **APPROVED**: "Approve the list" (hide the seven controls in Survey mode; amend FR-CSE-020) | 2026-11-13 |
