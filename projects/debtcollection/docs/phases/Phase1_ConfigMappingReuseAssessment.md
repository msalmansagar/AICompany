# Phase 1 §4 — Reuse Assessment: existing QDB configuration / mapping entities

**Status:** Phase 1 pre-condition, **read-only** · 2026-09-17 · org5869857f (BFD schema copy).
**No metadata was created, modified or deleted.** Required by the Phase 0 gate (correction 15) and the
Phase 1 approval §4 **before** `qdb_platformconfiguration` or `qdb_platformmapping` may be created.

Verdict per entity: **Reuse as-is** · **Reuse with extension** · **Cannot satisfy (reason)** · **TBD**.

---

## 1. What DCP actually requires

| Requirement | Shape |
|---|---|
| **R1 — Deployment configuration** | One row per deployment: platform type (OnPrem/Cloud), organisation code (HL/BFD), environment, customer/facility/case/activity/sms/whatsapp/email entity bindings, document provider, MIS enabled + provider, feature flags, and the three Rule Engine ruleset pointers (`eligibility`, `strategy`, `contacthold`) + `snapshotpolicy`. Never secrets. |
| **R2 — Canonical field mapping** | Normalised child rows: *business object → canonical field → CRM entity + field*, with data type, required, read/write, source, active. Must resolve a canonical Collection field to a physical column **without any code branch**. |

---

## 2. Candidate entities examined (12)

| Entity | Rows | Purpose (from its columns) | Verdict |
|---|---|---|---|
| `qdb_attributesmapping` | 0 | Source→target attribute copying for **Process Engine work items** — bound to `qdb_work_item_record_type`, `qdb_work_item_steps`, `qdb_outcomeworktasks`, `qdb_outcome` | **Cannot satisfy R2** — its source side is a work-item step, not a canonical domain field; adopting it would couple every Collection field read to the Process Engine work-item model |
| `qdb_parentattributemapping` | 0 | Same family, parent-record variant | **Cannot satisfy R2** — same coupling |
| `qdb_attributemappingconfiguration` | 0 | Default/rule-driven attribute **values** (`applyrule`, `filter`, `isdefault`, `sortingorder`, `value`) | **Cannot satisfy R2** — sets values, does not bind canonical→physical names |
| `qdb_taskapprovalappfieldmapping` | 0 | Task-approval **UI** field mapping (icon, colour, order) | **Cannot satisfy R2** — presentation concern, work-item bound |
| `qdb_sourcetargetentityrelation` | 0 | Entity-pair header for the mapping family above | **Cannot satisfy R2** — header only |
| **`qdb_form_submission_mapping`** | **30 (in use)** | Form Engine: form field → `target_entity_logical_name`, `target_attribute_logical_name`, `target_entity_set_name`, `target_navigation_property`, `transform_expression`, `is_child_entity`, `child_entity_relationship_name`, `is_active` | **Cannot satisfy R2, but see §3** — structurally the closest analogue; its source side is a `qdb_form_field`, so reuse would mean inventing Form Engine form definitions to represent canonical Collection fields, or extending an **actively used** Form Engine table with a foreign source concept. Rejected on blast radius, not on shape. |
| `qdb_reportentitymapping` | 34 (in use) | Report Engine entity/join composition (`joinexpressionjson`, `jointype`, `depth`) | **Cannot satisfy R2** — query composition, different problem |
| **`qdb_queueitemconfiguration`** | 0 | Per-entity binding for the work-item/queue component: `logicalname`, `pluralname`, `customernamefield`, `recordtypefield`, `sourcelocationfield`, `worktaskfield`, `workitemhistorylookupschema`, `taskparentattributes` | **Cannot satisfy R1, closest in shape** — it is a genuine "tell a generic component which entity and fields to use" table, but it is scoped to queue/work items (`isnrgp`, `nrgpfield`, `worktaskfield`) and has **no** platform type, environment, org code, provider settings, feature flags or ruleset pointers |
| **`qdb_autonumberconfig`** | 0 | `new_prefix`, `new_seperator`, `new_start_from`, `new_startingnumber`, `new_count`, `new_attribute` — auto-numbering configuration | **REUSE CANDIDATE — see §3.1** (not for R1/R2, but for case/activity numbering) |
| `qdb_da_configuration` | 0 | DA module thresholds | **Out of scope — must not be touched** (Phase 1 approval §5) |
| `qdb_nplconfiguration` | 0 | NPL reminder/loan-account binding | **Cannot satisfy** — NPL domain |
| `qdb_documentintegration` | 1 | `documentname` / `entityname` | **Cannot satisfy** — too thin |

---

## 3. Findings that change the DCP design

### 3.1 `qdb_autonumberconfig` — a genuine reuse opportunity (new)

The Field Dictionary proposed `AutoNumberFormat` (a platform feature) for `qdb_casenumber` and the
activity number. QDB already has an **auto-number configuration entity** with prefix, separator,
start-from and counter columns — implying an existing QDB auto-numbering plugin.

**Recommendation:** use the existing QDB auto-numbering mechanism for `qdb_casenumber` /
`qdb_activitynumber` rather than `AutoNumberFormat`. `AutoNumberFormat` is a Dataverse-era feature whose
availability on **CE 9.1 on-prem** is not guaranteed — the existing QDB mechanism is demonstrably
portable because it is plugin-based. **`TBD — Requires QDB Confirmation`:** the owning plugin, whether it
is deployed to HL, and whether DCP may register against it. *(Recorded as a new dual-platform risk: the
Phase 0 field dictionaries assumed `AutoNumberFormat`.)*

### 3.2 Two competing QDB conventions for referencing schema — DCP must pick one

| Convention | Used by | How a field is referenced |
|---|---|---|
| **Metadata-catalogue lookups** | Process Engine family (`qdb_attributesmapping`, `qdb_parentattributemapping`, `qdb_taskapprovalappfieldmapping`) | Lookups to `crmi_autonumber_system_entities` / `crmi_autonumber_entities_fields` — entities and fields stored **as CRM rows** |
| **Logical-name strings** | Form Engine (`qdb_form_submission_mapping`), Report Engine (`qdb_reportentitymapping`) | Plain `target_entity_logical_name` / `target_attribute_logical_name` strings |

**Decision for `qdb_platformmapping`: follow the logical-name-string convention.** Reasons:

1. The catalogue tables (`crmi_*`) must be **populated per organisation**; DCP cannot assume they exist or
   are current on HL, on BFD, or on an on-prem org. A string binding works everywhere.
2. Portability: a lookup to a catalogue row is an extra deployment dependency across two organisations and
   two platforms — precisely what the dual-platform principle tells us to avoid.
3. Precedent: the two QDB engines that already solve the "bind a logical field to a physical column"
   problem (Form Engine, Report Engine) both use strings, and both are in active use (30 and 34 rows).

DCP will additionally carry `entity_set_name` and `navigation_property`, as `qdb_form_submission_mapping`
does — these are required for Web API calls and are cheap to store.

---

## 4. Verdict against the gate

| Requirement | Verdict | Documented gap |
|---|---|---|
| **R1 `qdb_platformconfiguration`** | **No existing entity can satisfy it — create new** | Closest is `qdb_queueitemconfiguration`, which binds entity/field names for a generic component but is scoped to the queue/work-item domain and carries **none** of: platform type, environment, organisation code, document/MIS provider, feature flags, Rule Engine ruleset pointers, snapshot policy. Extending it would push Collection and platform concerns into a Process Engine table and make DCP's deployment configuration depend on the work-item model. |
| **R2 `qdb_platformmapping`** | **No existing entity can satisfy it — create new** | Closest is `qdb_form_submission_mapping`, which has the right *shape* but whose source side is a `qdb_form_field`. Reuse would require either fabricating Form Engine form definitions to stand in for canonical Collection fields, or extending an **actively used** (30 rows) Form Engine table with a foreign source concept — unacceptable blast radius on a live engine. |
| **Auto-numbering** | **Reuse existing `qdb_autonumberconfig` mechanism** (supersedes the `AutoNumberFormat` assumption) | `TBD` — owning plugin and HL deployment |
| **Schema-reference convention** | **Adopt logical-name strings** (Form/Report Engine precedent), not catalogue lookups | — |

**No duplicate generic configuration infrastructure is being created:** `qdb_platformconfiguration` and
`qdb_platformmapping` serve *deployment binding for the Collection domain*, a purpose no existing entity
covers, and they deliberately reuse the existing string-binding convention rather than inventing a third.

**Gate condition satisfied.** Creation of the two entities is unblocked — but, per the house rule, the
actual provisioning still requires explicit go-ahead before anything is written to the organisation.
