# Developer Guide — Writing Lookups Through the Dataverse Web API

Audience: engineers on the DFE backend, the in-CRM runtime, and anyone integrating with
Dataverse who has to write a lookup column.
Scope: how a lookup is written on POST and PATCH, why the two names involved must come
from metadata, how entity-set names are resolved, the per-mapping override, and where each
piece lives in this repo.

Read `adrs/ADR-SUBMIT-001-update-support.md` for the *why* behind the mapping-level design
and for the (not yet built) update/PATCH path.

---

## 1. The one rule

**A lookup column is never writable as a plain attribute value.**

```jsonc
// ✗ rejected — 400
{ "qdb_customerid": "8d971c3c-1e6e-f011-bae3-000d3a5b8c02" }
```
> `CRM do not support direct update of Entity Reference properties, Use Navigation
> properties instead.`

```jsonc
// ✓ correct
{ "qdb_CustomerId@odata.bind": "/accounts(8d971c3c-1e6e-f011-bae3-000d3a5b8c02)" }
```

The payload key is `<navigationProperty>@odata.bind`; the value is
`/<entitySetName>(<guid>)`. **POST and PATCH are identical in this respect** — there is no
separate "update form" of the syntax.

---

## 2. The three names, and where each comes from

A single lookup write involves three different names. Only the first is on the form
configuration; the other two are metadata and **cannot be derived by string manipulation**.

| Name | Example | Source | Notes |
|---|---|---|---|
| **Column (attribute) logical name** | `qdb_customerid` | `qdb_form_submission_mapping.qdb_target_attribute_logical_name` | What a developer configures. Lowercase. |
| **Navigation property** | `qdb_CustomerId` | `RelationshipDefinitions` | Usually the SchemaName casing, **but not always**. One per target for a polymorphic lookup. |
| **Entity set name** of the *referenced* table | `accounts` | `EntityDefinitions(...)?$select=EntitySetName` | **Not** `logicalName + "s"` in general — see §5. |

### Why not just uppercase the first letter?

Because it is not a casing rule. For a **polymorphic** lookup the navigation property
encodes the target:

```
contact.parentcustomerid  →  parentcustomerid_account
                          →  parentcustomerid_contact
opportunity.customerid    →  customerid_account
                          →  customerid_contact
```

Same column, two navigation properties. Which one you need depends on **what the user
picked**, not on the column. This is why the resolver takes the referenced entity as an
argument.

### The metadata queries

Navigation property:

```
GET /api/data/v9.2/RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata
      ?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity
      &$filter=ReferencingEntity eq 'contact' and ReferencingAttribute eq 'parentcustomerid'
```

Returns one row per target. Pick the row whose `ReferencedEntity` matches the selected
record's table; fall back to the single row when there is no ambiguity.

> **Gotcha:** `RelationshipDefinitions` rejects `startswith()` filters. Filter on equality
> and narrow client-side.

Entity set name:

```
GET /api/data/v9.2/EntityDefinitions(LogicalName='account')?$select=EntitySetName
```

Both change only when the schema changes, so both are cached for the life of the process
(backend) or the page (in-CRM).

---

## 3. Reading a lookup back

Writes and reads are asymmetric — this trips people up constantly.

| Operation | Syntax |
|---|---|
| Write | `"<navProp>@odata.bind": "/<entitySet>(<guid>)"` |
| Read the id | `_<column>_value` — e.g. `_parentcustomerid_value` |
| Read the display name | `_<column>_value@OData.Community.Display.V1.FormattedValue` |
| Read the target table (polymorphic) | `_<column>_value@Microsoft.Dynamics.CRM.lookuplogicalname` |
| `$select` / `$orderby` | Must use `_<column>_value`. The bare column name **400s**. |

Writing `_<column>_value` is rejected. Reading `<column>` returns nothing useful.

To get the annotations back, send:

```
Prefer: odata.include-annotations="*"
```

> `Xrm.WebApi` does **not** surface all annotations (notably
> `@Microsoft.Dynamics.CRM.morerecords` and `totalrecordcount`). Where the in-CRM runtime
> needs them it uses a same-origin `fetch` with the `Prefer` header instead — see
> `webresource/xrm/viewQuery.ts`.

---

## 4. Clearing a lookup

Both of these work on Dataverse 9.2 online (verified):

```jsonc
PATCH /contacts(<id>)
{ "parentcustomerid_account@odata.bind": null }     // 204, column reads back null
```

```
DELETE /contacts(<id>)/parentcustomerid_account/$ref  // 204
```

**Prefer the `$ref` form for on-premise** — the null-bind behaviour is less consistent on
older on-prem builds.

---

## 5. Entity set names — the naive-plural trap

The Web API addresses records by **entity set name**, and `logicalName + "s"` is a guess
that fails often.

Measured against org5869857f (3,069 entities total): **743 have an `EntitySetName` that is
not `logicalName + "s"` — 638 of those are custom tables, 290 of them `qdb_`-prefixed.**
Examples:

```
opportunity          → opportunities            (not opportunitys)
qdb_activity         → qdb_activities           (not qdb_activitys)
qdb_advisorservices  → qdb_advisorserviceses
qdb_agreementdetails → qdb_agreementdetailses
activityparty        → activityparties
accountleads         → accountleadscollection
qdb_account_qdb_exhibitions → qdb_account_qdb_exhibitionsset
```

This is not theoretical. `opportunity` is an **active submission target** on the
`loan-application` form, so before this was fixed that form POSTed to `/opportunitys`, got
a 404, and rolled the parent contact back — every submission failed.

Dataverse applies real English pluralisation rules (y→ies, s→ses, …) and some system
tables carry `set`/`collection` suffixes. **Do not reimplement the rules. Ask metadata.**

### The resolver

`backend/src/services/EntitySetNameResolver.ts`

```ts
const entitySet = await this.entitySetNames.resolve('opportunity'); // → "opportunities"
```

- One metadata call per entity, cached for process life.
- **Falls back to the naive plural with a logged warning** if metadata cannot be read. A
  metadata outage then behaves exactly as the code did before, rather than failing every
  write. Check for `falling back to the naive plural` in the logs.
- `seed(logicalName, entitySetName)` pre-populates the cache when you have an override.

In-CRM equivalent: `resolveEntitySetName()` in
`frontend/webresource/xrm/lookupBinding.ts`.

---

## 6. Multi-value lookups

A multi-lookup field in DFE writes **a delimited string of record ids into a mapped text
column** (DFE-FBE-002). It is *not* an N:N association.

```
"qdb_related_accounts": "1111…;2222…"
```

Rules, enforced identically in both runtimes by `joinLookupRecordIds()`:

- Accepts the control shape `[{ id, displayName }, …]` or bare GUIDs.
- Returns `null` for arrays that are not lookup selections (file references keep their own
  path).
- **Throws on a non-UUID id** rather than dropping it — a crafted id must never reach
  Dataverse inside a delimited string.
- An empty selection writes nothing.

> **Writing several real references as an N:N association does not exist in DFE.** It
> would need `POST /<set>(<id>)/<relationship>/$ref` per target and a schema decision
> about which relationship to use. Out of scope until someone specs it.

---

## 7. The value shape the UI actually produces

`LookupControl` stores a selection as an **object**, not a GUID:

```ts
{ id: '8d971c3c-…', displayName: 'Qatar National Bank' }
```

An API caller may send the bare GUID. Both must bind, so every entry point goes through:

```ts
readLookupRecordId(value): string | null   // accepts string OR { id }, else null
```

> **Lesson worth keeping.** An earlier fix was "verified" by POSTing a bare GUID through
> the API and declared done. Real UI submissions still failed, because the renderer sends
> the object form. **Test with the value shape the UI actually produces, not one you
> hand-made.**

---

## 8. Configuration — `qdb_form_submission_mapping`

One row = one field → one target column.

| Column | Type | Purpose |
|---|---|---|
| `qdb_form_definition_id` | Lookup | Owning form |
| `qdb_form_field_id` | Lookup | **Source** field |
| `qdb_target_entity_logical_name` | String | Target table |
| `qdb_target_attribute_logical_name` | String | Target column |
| `qdb_is_child_entity` | Boolean | Write to a child record instead of the parent |
| `qdb_child_entity_relationship_name` | String | **Navigation property** used to bind child → parent (see §9) |
| `qdb_transform_expression` | String | Optional value transform |
| `qdb_is_active` | Boolean | Inactive rows are ignored |
| **`qdb_target_navigation_property`** | String | **Optional override** — blank = resolve from metadata |
| **`qdb_target_entity_set_name`** | String | **Optional override** — blank = resolve from metadata |

### The two override columns

Added so that an environment where the service principal **cannot read metadata** (or a
value that must be explicit for review) can pin the binding by hand.

**Blank is the normal case and means "resolve from metadata".** Nobody has to fill these
in. Precedence:

1. Both halves set → used as-is, **no metadata call at all**.
2. One half set → that half is pinned, the other is resolved.
3. Neither set → both resolved from metadata.
4. Resolution fails → the mapping is skipped and the value is written as a plain attribute
   (the pre-fix behaviour).

Implemented in `readBindingOverride()` /`resolveLookupBindings()`
(`backend/src/services/submissionLookupBindings.ts`) and mirrored in `resolveBindings()`
(`frontend/webresource/xrm/submitEngine.ts`). The C# publish generator carries both fields
into the render cache with `NullValueHandling.Ignore`, so the in-CRM path honours them too.

Provision them with `scripts/provision-mapping-binding-overrides.mjs` (additive,
idempotent).

### Why these live on the mapping, not on the field

A recurring proposal is to add a "Write Schema Field Name" column to `qdb_form_field`.
That is the wrong table:

- The **field is the source**; the **mapping is the target**. Navigation property and
  entity set are properties of the *target pair*, not of the field.
- One field can map to **several** targets (parent and child, or two columns). A
  field-level column can hold only one value.
- It duplicates `qdb_target_attribute_logical_name`, so the two can disagree.
- It cannot express target entity, child-vs-parent, or the transform.

See ADR-SUBMIT-001 for the full argument.

---

## 9. Child records

When `qdb_is_child_entity` is true, the engine creates the child and binds it back to the
parent:

```jsonc
POST /opportunities
{
  "name": "…",
  "customerid_contact@odata.bind": "/contacts(<parentId>)"
}
```

Two things bite here:

1. **The child's collection URL needs the resolved entity set** — `/opportunities`, not
   `/opportunitys`. This is what §5 fixes.
2. **`qdb_child_entity_relationship_name` must hold the *navigation property*, not the
   relationship SchemaName.** These are different strings and the mistake is easy:

   ```
   ✓ customerid_contact              (navigation property — works)
   ✗ opportunity_customer_accounts   (relationship SchemaName — "undeclared property" 400)
   ```

   The second is a real relationship name in Dataverse, which is why it looks right. It is
   also the *account*-side one, so it fails twice over when the parent is a contact.

   Find the valid values with the `RelationshipDefinitions` query in §2 and read
   `ReferencingEntityNavigationPropertyName`.

> **This happened here.** The `loan-application` form's two opportunity mappings held
> `opportunity_customer_accounts` while their parent is a contact — so every submission of
> that form failed. Corrected to `customerid_contact` on 2026-07-26. All active child
> mappings in org5869857f now hold valid navigation properties.

**Validating the configured value.** A relationship name is only correct if it appears as a
`ReferencingEntityNavigationPropertyName` on the child entity:

```
GET /RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata
      ?$select=ReferencingEntityNavigationPropertyName,ReferencedEntity,ReferencingAttribute
      &$filter=ReferencingEntity eq '<childEntity>' and ReferencedEntity eq '<parentEntity>'
```

Note there is usually **more than one** way to relate the same pair — `opportunity` →
`contact` offers both `customerid_contact` (attr `customerid`) and `parentcontactid`. Pick
the one whose `ReferencingAttribute` is the column you actually mean; they are different
relationships with different semantics, and both will happily accept a bind.

---

## 10. Where the code lives

### Portal / backend (Node)

| File | Role |
|---|---|
| `backend/src/services/LookupBindingResolver.ts` | Resolves navigation property + entity set from metadata. `toBindingEntry()` formats the payload pair. |
| `backend/src/services/submissionLookupBindings.ts` | Per-submission orchestration: `resolveLookupBindings()`, `readLookupRecordId()`, `joinLookupRecordIds()`, `indexFieldsById()`, override precedence. |
| `backend/src/services/EntitySetNameResolver.ts` | Entity-set names for every URL the services build. |
| `backend/src/services/CrmSubmissionService.ts` | Sequential submit path. Builds the payload; binds instead of assigning. |
| `backend/src/services/CrmBatchSubmissionService.ts` | `$batch` changeset path (used when the form has grid fields). |
| `backend/src/services/CrmGridDataService.ts`, `CrmDataService.ts` | Read paths — also need resolved entity sets. |

**Bindings are resolved once, up front, before the payload builders run.** That keeps the
builders synchronous and means a form with no lookup mappings makes **zero** metadata
calls.

### In-CRM runtime (web resource)

| File | Role |
|---|---|
| `frontend/webresource/xrm/lookupBinding.ts` | Mirror of the backend resolver: `resolveEntitySetName`, `resolveLookupNavigationProperty`, `resolveLookupBinding`, `readLookupRecordId`, `joinLookupRecordIds`, `toBindingEntry`. |
| `frontend/webresource/xrm/submitEngine.ts` | `resolveBindings()` (override precedence), `buildPayload()`, child bind. |
| `frontend/webresource/xrm/viewQuery.ts`, `gridDataService.ts` | Read paths; import the shared helpers from `lookupBinding.ts`. |

The two runtimes are **deliberate mirrors**. If you change a rule in one, change it in the
other — they have drifted before, and the resulting bugs only appear on one surface.

### Publish generator (C#)

| File | Role |
|---|---|
| `Qdb.FormEngine.Core/Models/FormDefinitionModel.cs` | Carries `targetNavigationProperty` / `targetEntitySetName`. |
| `Qdb.FormEngine.Core/Generation/FormJsonGenerator.cs` | Emits them into the render cache (`NullValueHandling.Ignore`). |

### Shared types

`shared/src/types/form.types.ts` — `SubmissionMapping.targetNavigationProperty?` /
`targetEntitySetName?`.

> `shared` has **two** type files (`form.types.ts` for backend/frontend, `form.ts` for
> mobile). Keep them in sync; `npm run check:types-sync` in `shared` enforces it.

---

## 11. Error → cause

| Error | Cause |
|---|---|
| `CRM do not support direct update of Entity Reference properties` | Assigned a GUID to the column instead of binding. |
| `404` on `/<something>s` | Naive pluralisation. Resolve the entity set. |
| `An undeclared property '<name>' which only has property annotations in the payload` | The `@odata.bind` key is not a valid navigation property — usually a relationship SchemaName, or the wrong polymorphic variant. |
| `400` on `$select=<lookupcolumn>` | Use `_<column>_value`. |
| Value silently not written | The mapping is inactive, the field type is not `lookup`, or binding resolution failed and it fell through to a plain assignment. Check the logs for the resolver warnings. |
| Multi-lookup rejected | Raw `[{id,displayName}]` array reached the column. Route through `joinLookupRecordIds()`. |

---

## 12. Verifying a change

**Field type codes matter when seeding.** `lookup` is **100000008**;
100000007 is `multiselect`. Using the wrong one means the binding silently never applies.

Backend, live:

```bash
cd backend && npm run dev        # :4000, USE_RENDER_CACHE=false for live config
curl -X POST localhost:4000/api/forms/<formCode>/submit \
     -H 'Content-Type: application/json' \
     -d '{"formData":{"<schemaName>":{"id":"<guid>","displayName":"x"}}}'
```

The submit body key is **`formData`**, not `fieldValues`. The form must be **active** or
the live path returns `FORM_INACTIVE`.

Then read the record back and confirm `_<column>_value` and its `lookuplogicalname`
annotation.

In-CRM:

```
https://<org>.crm4.dynamics.com/main.aspx?appid=<appId>
    &pagetype=webresource&webresourceName=qdb_form_runtime.html&data=<formDefinitionGuid>
```

The standalone `/WebResources/qdb_form_runtime.html?data=…` URL renders **blank** —
`window.Xrm` does not exist outside the app shell.

Two traps when testing in CRM:

- **Stale bundle.** After deploying the web resource, CRM can still serve the old copy
  inside the iframe even after a full navigate. Verify the *loaded* bundle
  (`iframe.contentDocument.documentElement.innerHTML.includes('<marker>')`), and force a
  cache-busted iframe reload. Always confirm what is loaded before diagnosing "my change
  didn't work".
- **Session drop.** The automation tab drops to "Sign in to continue" roughly every 15
  minutes; a plain reload recovers it.

Render cache: **PATCHing `qdb_status` to the same value does not regenerate it.** Run
`scripts/republish-cached-forms.mjs`, then gunzip `qdb_form_render_caches.qdb_runtime_json`
to confirm the fields you expect are actually being served.

Adding a new metadata read to a service will **break its existing tests** — the fetch
mocks are FIFO queues and the new call eats the first queued response. The pattern in use
is an interceptor that answers `EntityDefinitions` URLs before `mockFetch` sees them; see
the top of `CrmSubmissionService.test.ts`.

---

## 13. Open items

- **N:N association** for multi-value lookups — does not exist, needs a design decision.
- **Update/PATCH path** — neither runtime has one. Nothing currently identifies *which*
  record to update. Design in ADR-SUBMIT-001 (Draft); concurrency (`If-Match`) and a
  security review are open before it can ship.
- **No authoring-time validation.** `qdb_child_entity_relationship_name`,
  `qdb_target_navigation_property` and `qdb_target_entity_set_name` are free-text columns
  that nothing checks until a submission fails at runtime. The `loan-application` breakage
  (§9) sat there undetected for exactly that reason. A publish-time check against metadata
  would catch the whole class.

---

## 14. Worked example — a custom entity, both ways

Seeded by `scripts/seed-custom-entity-lookup-demo.mjs`, form **`custom-entity-lookup-demo`**.
Everything in it is custom, because that is where guessing fails.

| | |
|---|---|
| Child (written to) | `qdb_nfgapplication` |
| Target (pointed at) | `qdb_applicationstatus` |
| Target entity set | **`qdb_applicationstatuses`** — `qdb_applicationstatuss` returns **404** |
| Column → nav property | `qdb_externalstatus` → **`qdb_ExternalStatus`** (differs by casing) |
| | `qdb_internalstatus` → **`qdb_InternalStatus`** |

Neither name is derivable from the column. That is the whole point.

The form maps **both** lookups to the same target table, configured differently on purpose:

| Field | `qdb_target_navigation_property` | `qdb_target_entity_set_name` | Binding comes from |
|---|---|---|---|
| External Status | `qdb_ExternalStatus` | `qdb_applicationstatuses` | the mapping (**pinned**) |
| Internal Status | *(blank)* | *(blank)* | **metadata** |

Both emit the same shape:

```jsonc
POST /qdb_nfgapplications
{
  "qdb_name": "…",
  "qdb_ExternalStatus@odata.bind": "/qdb_applicationstatuses(e22dfd24-…)",
  "qdb_InternalStatus@odata.bind": "/qdb_applicationstatuses(857a0126-…)"
}
```

Verified live — record `qdb_nfgapplication(bec9e33f-2789-f111-ab0f-70a8a55bc6a5)`, both
columns resolving back to `qdb_applicationstatus`.

**The takeaway for the team: leave both override columns blank.** Metadata resolution is
the normal path and it handles custom tables correctly on its own. Fill them in only where
the service principal cannot read metadata, or where a value must be pinned for review —
and note that a pinned value goes stale if the schema is renamed, whereas a resolved one
does not.

Scale of the problem in org5869857f: **5,144 custom-to-custom lookups where both the
navigation property and the entity set are non-obvious**, and 290 `qdb_` tables whose
entity set is not `logicalName + "s"`.

---

Related: `adrs/ADR-SUBMIT-001-update-support.md`, `docs/DEVELOPER-GUIDE-fbe.md`
(multi-lookup authoring), `docs/developer-feature-reference.md`.
