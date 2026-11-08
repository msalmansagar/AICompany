# ADR-SUBMIT-001 — Update (PATCH) support and lookup binding in Submission Mapping

**Status:** Draft — for discussion with the backend team
**Date:** 2026-07-26
**Context owner:** Architect

---

## 1. What the engine does today

`qdb_form_submission_mapping` holds one row per *(form field → target column)*:

| Column | Meaning |
|---|---|
| `qdb_form_field_id` | which form field supplies the value |
| `qdb_target_entity_logical_name` | which table to write |
| `qdb_target_attribute_logical_name` | which column to write |
| `qdb_is_child_entity` + `qdb_child_entity_relationship_name` | parent record or a related child row |
| `qdb_transform_expression` | value transform |
| `qdb_is_active` | staged / retired |

Both runtimes read those rows and build a payload:

```ts
// backend/src/services/CrmBatchSubmissionService.ts
payload[mapping.targetAttributeLogicalName] = value;
```

The record is then **created**:

* portal — `BatchChangesetBuilder.addParentRecord(...)` emitted as `POST` inside a `$batch` changeset;
* in-CRM — `webApi().createRecord(parentEntity, parentPayload)`.

**There is no update path in either runtime, and no column that identifies a record to update.**

## 2. The two gaps

### 2.1 Update is impossible to express

A submission always creates. Nothing in the model answers *"which existing record should this write to?"*, so
"submit this form to patch record X" cannot be configured at all.

### 2.2 Lookups cannot be written on the portal path

A Dataverse lookup is never writable as a raw attribute value. It must be written as a **navigation binding**:

```json
{ "<navigationProperty>@odata.bind": "/<entitySetName>(<guid>)" }
```

Writing the column instead returns:

> `CRM do not support direct update of Entity Reference properties, Use Navigation properties instead.`

The portal path (`CrmSubmissionService:205`, `CrmBatchSubmissionService.buildPayload`) assigns
`payload[targetAttributeLogicalName] = value` with **no binding handling**, so any mapping whose target is a
lookup fails on submit. The in-CRM path does handle it (`webresource/xrm/submitEngine.ts:63`) but on two
assumptions that do not hold generally:

```ts
payload[`${mapping.targetAttributeLogicalName}@odata.bind`] = `/${field.lookupEntity}s(${cleanGuid(raw)})`;
```

1. **navigation property === column logical name.** Often true for columns created by our provisioning
   scripts, frequently false for hand-created lookups, where the navigation property carries the SchemaName
   casing (`qdb_EditFormCurrentTabId`). A mismatch returns a deliberately vague `400`.
2. **entity set name === logical name + "s".** Not universally true; the set name must come from metadata.
3. **Polymorphic lookups are unsupported.** `customer`, `owner` and `regarding` expose one navigation
   property *per target* (`parentcustomerid_account`, `parentcustomerid_contact`). A single column name
   cannot say which was meant.

This is the concrete reason a "writing schema field" feels necessary: for a lookup, the name you *write*
genuinely differs from the column name recorded in the mapping.

## 3. Decision

Extend the existing mapping model. Do **not** add a target-column field to `qdb_form_field`.

A field-level column would duplicate `qdb_target_attribute_logical_name` with no rule for which wins, and
could not express target entity, parent-vs-child, transform, active state, or one field writing to two
targets — all of which the mapping already supports.

### 3.1 Resolve the binding from metadata, do not type it

The navigation property and entity set name are **derivable**. Resolve them at publish time and cache them
on the mapping row, so makers never hand-enter a binding name and existing rows keep working:

| New column | Type | Meaning |
|---|---|---|
| `qdb_target_navigation_property` | String(100) | navigation property to bind; resolved, not typed |
| `qdb_target_entity_set_name` | String(100) | entity set for the bound record |

Resolution (already implemented for the grid path in `webresource/xrm/viewQuery.ts`):

```
GET /RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata
    ?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity
    &$filter=ReferencingAttribute eq '<targetAttribute>'
GET /EntityDefinitions(LogicalName='<targetEntity>')?$select=EntitySetName
```

For a polymorphic lookup the resolver picks the relationship whose `ReferencedEntity` matches the form
field's configured lookup entity — the ambiguity is resolved by data already on the field.

Both runtimes then share one rule: *if the mapping carries a navigation property, bind; otherwise assign.*
Unset behaves exactly as today, so nothing existing changes.

### 3.2 Express the operation

Operation mode belongs to the **form**, not the field — one submission writes one parent record:

| New column on `qdb_form_definition` | Type | Meaning |
|---|---|---|
| `qdb_submission_operation` | Picklist | `Create` (default) / `Update` / `Upsert` |
| `qdb_target_record_id_field` | String(100) | schema name of the form field holding the target record id |
| `qdb_target_alternate_key` | String(200) | optional alternate key, used when no record id field is set |

`Create` is the default and is what every existing form gets, so this is additive.

### 3.3 Runtime change

`buildPayload` is untouched — the same mappings, transforms and bindings serve both operations. Only the
dispatch differs:

| Operation | Portal (`$batch`) | In-CRM |
|---|---|---|
| Create | `POST /<set>` | `createRecord` |
| Update | `PATCH /<set>(<id>)` | `updateRecord` |
| Upsert | `PATCH /<set>(<key>)` | `PATCH` via alternate key |

Update resolves its id from `qdb_target_record_id_field`; a missing or empty value is a validation error
before anything is sent, not a partial write. Child-entity mappings and Entry Grid rows keep their existing
create semantics unless a child mapping itself carries a record-id field.

## 4. Consequences

* One source of truth for "where does this field write" — the mapping row.
* Lookup writes work identically on both runtimes, including polymorphic targets, and stop depending on
  naming coincidence.
* The portal's inability to write lookups is fixed as a side effect.
* Cost: two columns on the mapping, three on the form definition, a metadata resolver in the publish
  pipeline, the dispatch switch in two runtimes, designer UI for the operation, and the usual mirror in the
  C# generator.
* Not addressed here: concurrency (whether an update should send `If-Match`), and permissions — an update
  path lets a form write to records the submitter may not own, which needs a security review before Update
  is enabled for any live form.

## 5. Alternatives rejected

| Option | Why not |
|---|---|
| `qdb_writing_schema_field` on `qdb_form_field` | Duplicates the mapping's target column; cannot express entity, child, transform, or multiple targets; two sources of truth. |
| Maker types the navigation property | It is derivable from metadata; hand-typed names drift when a relationship is renamed and fail with an unhelpful 400. |
| Separate "update mapping" entity | Doubles the configuration surface for one differing attribute — the operation, not the mapping. |
