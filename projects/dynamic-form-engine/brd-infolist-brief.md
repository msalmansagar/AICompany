# DFE-INFOLIST-001 — Brief: Configurable List Styles in the Inline Info-Card Field

**Date:** 2026-07-20
**Status:** Awaiting CEO approval
**BRD:** projects/dynamic-form-engine/brd-infolist.md

## Problem

The inline info-card field renders its body as a single paragraph. Makers who need to present
step-by-step instructions or bulleted guidance must either embed a wall of text or create
multiple disconnected fields. There is no way to author a numbered or bulleted list — including
the circled-numeral style (e.g. Roman numerals inside filled circles) used in QDB's design
reference — within a single info-card field.

## Proposed solution

Add two new designer-configurable properties to the existing `info-card` field type:

| Property           | Values                                                  | Default (absent)   |
|--------------------|---------------------------------------------------------|--------------------|
| `infoCardListType` | `bullet` / `numbered-arabic` / `numbered-roman`         | None (plain text)  |
| `infoCardListMarker` | `plain` / `circle` / `none`                           | `plain`            |

When a list type is selected, `infoCardBody` is split on newlines to produce list items.
No new items column is added — the body field already holds the text, and the newline-split
approach requires the fewest data-model changes.

## What gets built

- 2 new nullable Picklist columns on `qdb_form_field` (additive, idempotent provision script)
- CRM solution XML RootComponent entries for both columns
- Shared types updated in BOTH `form.types.ts` AND `form.ts` (CI parity-checked)
- Node backend mapper (`CrmMetadataService.ts`)
- C# plugin mapper (`FieldBuilder.cs` + `PicklistMapper.cs` + `FormDefinitionModel.cs`) — render-cache path; must ship with the frontend
- Designer panel: two new dropdowns in `InfoCardFieldPanel.tsx`; designer save path persists to Dataverse
- Frontend runtime: semantic `<ul>` / `<ol>` + CSS circled-marker styling in `InfoCardField.tsx`
- Mobile runtime: newline-split rows with text prefix + optional circle `View` in `FormInfoCardField.tsx`
- Backward compatibility: fields without `infoCardListType` render with zero code-path change

## Open questions for CEO

1. **OQ-001 — Item delimiter:** Newline ('\n') is the proposed delimiter. If a maker later enables a list type on an existing body that contains embedded newlines, those newlines will split unexpectedly. Is this trade-off acceptable, or should a different delimiter (e.g. `|||`) be used?
2. **OQ-003 — Mobile 'circle' marker:** Implementing the circled-marker in React Native requires a custom View + Roman-numeral prefix utility. Should this be a Must Have at launch or deferred to a follow-up?
3. **OQ-005 — 'None' marker + list type:** The combination "list type = bullet, marker = none" produces an indented list with no visible markers. Is this a supported use case, or should the designer prevent it?
