# DFE-RULES-002 — Architecture (items 1, 2, 7)

Status: accepted for items 1, 2 and 7. Item 2 reading C chosen by the CEO on 2026-09-30.
Inputs: brd-rules-batch-2.md (approved 2026-09-29), code as of `9b67b3a2`.

## 1. Corrections to the BRD's data model

The BRD was written from a brief, not from the code. Three of its assumptions are false.

| BRD said | Code says | Consequence |
|---|---|---|
| FR-002 a `RuleTargetKind` union exists | No such type. A rule's target kind is implied by which target id it carries. | Grid-column actions carry their own target ids; no union is added. |
| FR-003 a new `qdb_target_grid_id` column is needed | Designer rules already store every target inside `qdb_conditions_json`. | **No new column.** Removes one cloud provisioning step and one manual on-prem step. |
| FR-017/018 a `qdb_render_style` picklist and `FieldRenderStyle` union exist | Neither exists. Radio fields use `qdb_radio_render_style` (List, Cards); dropdowns have no style. | Rating becomes a third option, `100000002 Rating`, on `qdb_radio_render_style`, honoured for radio **and** dropdown fields. |
| FR-011 `parentRecordId` is "already in form context" | `parentRecordId` is the record the form's own submission **creates**. The in-CRM runtime has no record context at all. | Item 2 cannot be built as specified. See §2.2. |

## 2. Designs

### 2.1 Item 1 — business rules on grid columns

Actions: `showColumn`, `hideColumn`, `makeColumnRequired`, `makeColumnOptional`,
`makeColumnReadonly`, `makeColumnEditable` (designer: `show_column` … `make_column_editable`).

- Designer JSON action: `{ action_type, target_field_code: <grid field code>, target_column_id: <grid column record id> }`.
  The grid is named the way every field target is; the column by record id, as tabs and sections are.
- Published rule: `targetFieldId` = grid field id, new `targetColumnId` = column id.
- Runtime result: `gridColumnState[gridFieldId][columnId] = { isVisible?, isRequired?, isReadonly? }`.
- One pure function, `applyGridColumnRuleState(columns, state)`, produces the effective column
  list. The Entry Grid renders from it and grid validation checks against it, so display and
  validation cannot disagree.
- A column hidden by a rule is also made optional, so a user can never be blocked by a cell
  they cannot see (OQ-004).
- A rule naming a column the grid does not have changes nothing (FR-008).

### 2.2 Item 2 — conditions on a "parent" record: BLOCKED

There are three readings, and each is different work:

| Reading | Where the record id comes from | Runtime data access |
|---|---|---|
| A. The record the form is **opened from** (e.g. a Case whose form embeds this one) | New launch parameter / host form context | One retrieve at load |
| B. The record the form is **editing** (portal `?recordId=`) | Already present, portal only | Already loaded as form values — conditions work today |
| C. A record **selected in a lookup** on the form (e.g. Sponsor → its Industry) | The lookup's current value | Retrieve on each lookup change |

**CEO decision 2026-09-30: C, the record selected in a lookup.**

Design:
- Condition: `{ field_code: <lookup>, related_attribute: <column>, operator, value }` in the designer;
  `relatedAttribute` on the published `RuleCondition`. No new CRM column.
- Runtime: before each evaluation the form reads the named columns of each selected record,
  once per record id, into facts named `<lookup>-><column>`. Every expected fact is always
  present (null when nothing is selected or the read fails), because the rule engine rejects
  unknown facts. Equality on related values compares as text, so a picklist's 6 matches "6".
- In CRM: `Xrm.WebApi.retrieveRecord` as the signed-in user; CRM security applies.
- Portal: `GET /api/related-records/:formCode/:field/:recordId`. The service principal reads only
  the columns the form's own published rules name for that lookup, from its configured entity.
  The caller cannot choose columns. The record id must be a GUID and column names must be logical names.
- Designer: a "Related column" picker appears for lookup fields, offering scalar columns only
  (OQ-002). Related-entity joins beyond one hop are out of scope.

Security review (2026-09-30) and what was done:

| Finding | Severity | Resolution |
|---|---|---|
| SEC-RR-001 any record of the entity readable by GUID | High | **Fixed.** The read is a collection query that applies the lookup's own `filterExpression`, so only records the lookup would offer can be read. A lookup with **no** filter still exposes the rule-named columns of any record of its entity to any signed-in portal user. Makers must not point related conditions at personal-data columns of an unfiltered lookup. |
| SEC-RR-002 Dataverse error text reaches the client | Medium | **Fixed for this route**: any Dataverse failure becomes a plain 404. The same leak exists in `CrmBaseService` for **every** portal route; that is pre-existing and left for the audit to schedule. |
| SEC-RR-003 no rate limit | Medium | **Fixed.** Per-user sliding window, `RELATED_RECORD_RATE_LIMIT_PER_MIN` (default 60). Per backend instance, not global. |
| SEC-RR-004 in-CRM path skipped the logical-name check | Low | **Fixed** in the shared allowlist, so both paths drop malformed column names; the in-CRM read also checks the entity name. |
| SEC-RR-005 cached form keeps a removed column readable until TTL | Low | Accepted. The window cannot widen beyond what was legitimate. After removing a sensitive related condition, clear the metadata cache. |
| PDPPL | — | Handed to the audit: whether rule-named columns are personal data, and the portal region. |

### 2.3 Item 7 — rating style

- Adopt Fluent UI v9 `Rating` (`@fluentui/react-components` 9.73.8, already a dependency;
  github-research: no new package, MIT, Microsoft-maintained).
- Star N = the Nth active option by display order. Selecting it stores that option's value.
- Readonly: `RatingDisplay`-style non-interactive stars. RTL follows the document direction,
  which Fluent handles.
- A "Clear" button empties an optional rating (OQ-003); Fluent does not report a click on the selected star.
- Designer: a "Display style" select (List, Cards, Rating) on radio and dropdown fields,
  saved to `qdb_radio_render_style`, following the Number display style pattern.

## 3. Schema

| Change | Cloud | On-prem |
|---|---|---|
| `qdb_radio_render_style` option `100000002 Rating` | `scripts/provision-rating-render-style.mjs` — **needs CEO go-ahead to run** | Add by hand in the solution; kit README |

Items 1 and 7 need nothing else. Item 2 is unscoped until §2.2 is answered.

## 4. Both publishers

Every new action and field is mapped in the backend `CrmMetadataService` **and** the C#
`FieldBuilder` / `PicklistMapper`, with a test on each side.
