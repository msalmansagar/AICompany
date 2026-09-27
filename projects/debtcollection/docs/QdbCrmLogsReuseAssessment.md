# DCP — `qdb_crmlogs` Reuse Assessment (Phase 0, gate correction 1)

**Status:** Phase 0 evidence + proposal · 2026-09-17 · **read-only** metadata inspection of `org5869857f`.
**No change was made to the entity.** This document is the authoritative mapping for Debt Collection
technical/integration logging and supersedes both the proposed `qdb_integrationlog` (new entity) and the
later proposal to reuse `qdb_integrationlogs` — **both are withdrawn**.

Authoritative QDB decision: **reuse the existing `qdb_crmlogs`** for DCP integration/technical logs.

---

## 1. Current entity — what it actually is

| Property | Value |
|---|---|
| Logical name / entity set | `qdb_crmlogs` / `qdb_crmlogses` |
| Display name | **CRM Logs** |
| Kind | **Custom ACTIVITY entity** (`IsActivity = true`) — not a plain custom table |
| Primary name attribute | `subject` (activity base) |
| Ownership | **UserOwned** |
| Created | 2025-09-21 (arrived with the `QDBAllEntites` schema import) |
| **Rows on the sandbox** | **1,295** — already in use; DCP will be a *co-tenant* of this table |
| Native audit | **disabled** (`IsAuditEnabled = false`, changeable) |
| Attributes | 110 total — **9 business columns** + activity base |

**Current purpose (inferred from its shape and QDB's statement that it is used for integration logging):**
a general-purpose execution/error log for QDB integrations, plugins, custom workflow activities and console
jobs — capturing a source, a destination endpoint, the request and response payloads, and any exception.

### 1.1 Existing business columns

| Column | Type | Length | Display |
|---|---|---|---|
| `qdb_source` | String | 100 | Source |
| `qdb_destination` | String | 1000 | Destination |
| `qdb_type` | Picklist | — | Type — options **`CutomWorkflow`** *(sic — typo exists in the org)*, `Plugin`, `Console` |
| `qdb_request` | Memo | 1,048,576 | Request |
| `qdb_response` | Memo | 1,048,576 | Response |
| `qdb_exception` | Memo | 1,048,576 | exception |
| `qdb_isexception` | Boolean | — | Is Exception |
| `qdb_depth` | Integer | — | Depth (plugin execution depth, not a retry counter) |
| `qdb_saveditem` | Lookup → `queueitem` | — | Saved Item |

### 1.2 Activity base columns available for reuse

`subject` · `description` · `regardingobjectid` (polymorphic) · `statecode` / `statuscode` ·
`prioritycode` · `actualstart` · `actualend` · `actualdurationminutes` · `scheduledstart` /
`scheduledend` · `createdon` / `createdby` · `modifiedon` · `ownerid`.

---

## 2. DCP requirement → `qdb_crmlogs` mapping

Classification per the gate: **Existing field — reuse** · **Existing field — mapped** · **Existing entity
requires extension** · **Not required** · **TBD — Requires QDB Confirmation**.

| # | DCP technical-logging requirement | `qdb_crmlogs` | Classification |
|---|---|---|---|
| 1 | Integration / source name | `qdb_source` (100) — DCP writes a reserved prefix, e.g. `DCP.<service>` | **Existing field — reuse** |
| 2 | Operation | `subject` (activity primary name), by convention `DCP · <operation>` | **Existing field — mapped** |
| 3 | **Correlation ID** | no column | **Requires extension** |
| 4 | **Batch / run ID** | no column | **Requires extension** |
| 5 | **Source record / reference** (MIS customer id, account number, source row/version) | only inside `qdb_request` free text | **Requires extension** |
| 6 | Target CRM record / reference | `regardingobjectid` — see §4 caution | **Existing field — reuse** |
| 7 | Status | `statecode` / `statuscode` + `qdb_isexception` | **Existing field — mapped** |
| 8 | **Severity / log level** | only the boolean `qdb_isexception`; `prioritycode` is a task priority, not a log level | **Requires extension** |
| 9 | **Error code** (structured) | `qdb_exception` is unstructured text | **Requires extension** |
| 10 | Error message | `qdb_exception` (Memo) | **Existing field — reuse** |
| 11 | **Retry / attempt information** | `qdb_depth` is plugin execution depth — **not** a retry counter; do not overload it | **Requires extension** |
| 12 | Received timestamp | `actualstart` (fallback `createdon`) | **Existing field — mapped** |
| 13 | Processed / completed timestamp | `actualend` | **Existing field — mapped** |
| 14 | Duration | `actualdurationminutes` is **minutes** — too coarse for API calls measured in ms | **Existing field — mapped**, ms precision **requires extension** |
| 15 | Diagnostic information | `description` + `qdb_exception` | **Existing field — reuse** |
| 16 | Related CRM record | `regardingobjectid` (same as #6) | **Existing field — reuse** |
| 17 | Provider / source system | `qdb_source` + `qdb_destination` | **Existing field — reuse** |
| 18 | Request / response metadata *where QDB policy permits* | `qdb_request` / `qdb_response` (1 MB each) | **Existing field — reuse, policy-gated** — see §5 |
| 19 | Log type covering an integration/service run | `qdb_type` has only `CutomWorkflow` / `Plugin` / `Console` | **Requires extension** (add an option) *or* map to `Console` — `TBD — Requires QDB Confirmation` |

### 2.1 Proposed extensions (NOT implemented; approval required before any Phase 1 change)

| Proposed column | Type | Why the existing model cannot carry it |
|---|---|---|
| `qdb_correlationid` | String (100) | end-to-end tracing across React → Integration Service → CRM; nothing equivalent exists |
| `qdb_batchid` | String (100) | ties a sync run together; required for replay and for the snapshot idempotency key |
| `qdb_operation` | String (100) | `subject` is a display field; a queryable operation code is needed for monitoring |
| `qdb_severity` | Picklist (Debug/Info/Warn/Error/Fatal) | boolean `qdb_isexception` cannot express levels |
| `qdb_errorcode` | String (100) | structured, filterable failure classification |
| `qdb_attemptnumber` | Integer | retry counter — `qdb_depth` means something else |
| `qdb_durationms` | Integer | millisecond precision |
| `qdb_sourcereference` | String (200) | MIS business key of the record being processed |
| `qdb_type` new option | Picklist option | e.g. `Integration` / `Service` |

**Alternative considered:** encode these as structured JSON inside `qdb_request`. Rejected for
monitoring/alerting — they would not be queryable, and §5 argues for *less* payload retention, not more.

---

## 3. Audit boundary (gate items 1 and 14)

```
 MIS / External Integration ─▶ Integration Service / Adapter ─▶ qdb_crmlogs
                                                               technical execution / error / retry /
                                                               correlation evidence

 Collection Case / Activity / CRM records ─▶ Dynamics Native Audit ─▶ business audit trail
```

- `qdb_crmlogs` is **technical/integration/system execution logging only**.
- Dynamics **native audit** owns business/entity field-change audit.
- The broad `msst_dcpauditlog` pattern (a row for every field change on seven entities, 14 async plugin
  steps) **must not be rebuilt inside `qdb_crmlogs`**, and `qdb_crmlogs` must not be used as a substitute
  for native business audit.
- No business-field audit duplication, no secrets, no unrestricted request/response bodies merely because
  a technical log exists.

---

## 4. Consequences of it being an **activity** — three cautions

1. **Timeline pollution.** An activity with `regardingobjectid` set to a `qdb_collectioncase` will appear
   in that case's **Timeline**, mixing technical logs into the officer's business view. **Recommendation:**
   DCP does *not* set `regardingobjectid` to business records by default; it carries the business key in the
   proposed `qdb_sourcereference` and links only where a support workflow needs it. Final choice
   `TBD — Requires QDB Confirmation`.
2. **Activities are deletable.** Append-only is not free — the existing `ImmutabilityGuard` pattern
   (Update/Delete blocked post-create) must be extended to DCP-sourced rows, or the platform must accept
   that technical logs are mutable. Note this conflicts with nothing today because the table is unguarded.
3. **Shared table.** 1,295 rows already exist from other QDB systems. **No DCP query may assume it owns
   the table** — every DCP read filters on the `qdb_source` prefix convention, and DCP must not apply an
   entity-wide plugin or retention job that would affect other teams' rows.

---

## 5. Security, PII and retention

| Concern | Position |
|---|---|
| `qdb_request` / `qdb_response` (1 MB memos) | **Highest risk column pair.** MIS payloads carry QID, name, mobile, balances — PDPPL-relevant. DCP must log **metadata by default**, store payloads only where QDB policy explicitly permits, redact identifiers, and cap size. Never log secrets, tokens or credentials. |
| Field-level security | Consider a field-security profile over `qdb_request` / `qdb_response` if payload retention is permitted — `TBD — Requires QDB Confirmation` |
| Ownership | UserOwned; DCP rows will be owned by the integration service principal. Role design: write for the service account, read for support/admin/audit roles, **Delete never granted** |
| Retention / housekeeping | A background sync over ~4,400 records could grow this shared table quickly. A retention policy is needed and is `TBD — Requires QDB Confirmation`; DCP must not purge rows it does not own |
| Native audit on the entity | currently disabled — appropriate; it *is* the log |

---

## 6. Platform compatibility

| | Assessment |
|---|---|
| **Cloud (Dataverse)** | Compatible — standard custom activity entity; present and in use on the sandbox. **Cloud Runtime Tested** for existence/shape (read-only metadata read); DCP write path not yet exercised |
| **On-Prem (D365 CE 9.1)** | **Compatible by design** — custom activity entities, memos, picklists and activity base columns are all 9.x features. Presence on the QDB on-prem organisation is `TBD — Requires QDB Confirmation` (the sandbox holds a BFD schema copy; the on-prem estate has not been inspected) |
| Shared code | Yes — writing a log row is an `ICrmAdapter.create` call; no platform branch |
| Adapter required | No |
| Portability issue | None identified, beyond confirming the entity exists in each target organisation |

---

## 7. Open items

1. May `qdb_crmlogs` be **extended** with the nine columns/options in §2.1? (No change in Phase 0.)
2. Should DCP set `regardingobjectid` to business records, accepting Timeline visibility? (§4.1)
3. Is payload retention in `qdb_request` / `qdb_response` permitted for DCP, and under what redaction and
   size policy? (§5)
4. Retention/housekeeping policy for a shared log table. (§5)
5. Does `qdb_crmlogs` exist on the QDB **on-prem** organisation with the same shape? (§6)
6. Is the `qdb_source` prefix convention acceptable as the DCP co-tenancy boundary? (§4.3)
7. Should the `qdb_type` typo (`CutomWorkflow`) be corrected, or left alone as an existing-data concern?

All seven are `TBD — Requires QDB Confirmation`. **The entity is not modified during Phase 0.**
