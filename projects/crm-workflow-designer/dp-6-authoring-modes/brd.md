═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DP-6 — Authoring Modes: Business Analyst and Developer
Engagement:     DP-6 (split out of the Process Engine enhancement backlog, 2026-08-18)
Parent system:  CRM Workflow Designer (CWFD)
Prepared by:    MSS Technologies — Business Analyst
Date:           2026-08-18
Version:        1.0
Status:         DRAFT — Pending CEO Approval
═══════════════════════════════════════════════════

---

## 1. EXECUTIVE SUMMARY

A business analyst is asked to design a process for something that does not exist yet.
The Loan Application table has not been built; the steps, roles and outcomes are
nonetheless well understood and worth capturing now. Today CWFD cannot hold that work:
the moment the analyst reaches a decision point and wants to say *"if the loan amount is
over 100,000 send it to the Manager, otherwise auto-approve"*, the designer opens
Advanced Find, Advanced Find asks **"conditions on which table?"**, and there is no table.

DP-6 introduces two authoring modes so that a process can be designed before its data
model exists and completed once it does.

**The framing that shapes every requirement below: this is not two editors, and it is not
"conditions without an entity". It is one process model passing through two gates.** The
analyst authors intent; a developer later binds that intent to real tables and columns;
only then may the process be published. The industry name for this is late binding, and
it is how every process engine that is not welded to a schema already works — Camunda,
Flowable, Zeebe and Step Functions all evaluate conditions against a named variable
payload rather than a database, which is precisely why their analysts never hit this wall.

A pre-analysis of the engine's decompiled source and of org5869857f produced findings that
change what is buildable and what is cheap. They are set out in §3 because two of them
invert the obvious design.

---

## 2. BUSINESS CONTEXT AND PROBLEM STATEMENT

### 2.1 Who is blocked

| Actor | Today | Needed |
|---|---|---|
| Business analyst | Cannot express a routing condition until IT has built the table | Author the whole process, conditions included, against business concepts |
| Developer | Receives process intent as prose or a workshop memory, re-authors it | Receives a structured process and binds it |
| Process owner | Cannot review or approve a process before build | Review and approve an unbound process |

### 2.2 The cost of the current gap

Process design and data-model build are serialised: nothing can be designed until the
schema is decided. Where the analyst does capture intent, it is captured outside CWFD in
a document, and every transcription from that document into the designer is an
opportunity for drift that nothing detects.

### 2.3 Why this cannot simply be "type the table name anyway"

The platform will accept it. It will not work, and it will not tell anyone.
See FN-1 — this is the single most important finding in this document.

---

## 3. FINDINGS THAT SHAPE THESE REQUIREMENTS

All verified against org5869857f and the decompiled engine assemblies between
2026-08-13 and 2026-08-18. Each is stated with how it was established.

### FN-1 — The platform does not validate a condition. At all. 🔴

`ValidateAdvanceFindFilter` calls `OutcomeWorkTaskHandler.ValidateFilter`, which performs
three string checks: the value is non-empty, it contains `<filter`, it contains
`<condition`. There is no XML parse, no entity check and no attribute check.

**A condition naming a table that does not exist saves cleanly and looks finished.** It
fails only when the process executes, which on this org has never happened
(`qdb_tasks` = 0). A placeholder-name approach would therefore produce configuration that
passes review and detonates months later. This is the failure mode that has already cost
this engagement three duplicated pieces of work, and it is why the publish gate in §5.C is
a hard requirement rather than a nicety.

*Established by: decompiling `QDB.CRM.ProcessConfiguration` with ilspycmd and reading the
validator.*

### FN-2 — Two of the three condition types do not need the missing table as their root

`CommanHandler.CheckFilter` is called from three places, against three different records:

| Condition | Column | Evaluated against | Root entity of the query |
|---|---|---|---|
| Which process applies | `qdb_work_item_record_type.qdb_filter` | the application record | **the application entity** |
| Which route / next step | `qdb_outcomeworktasks.qdb_filter` | the task | **`qdb_task`** |
| Whether a parallel task is created | `qdb_work_item_steps.qdb_filter` | the task | **`qdb_task`** |

`qdb_task` always exists. For routing and conditional task creation — the two the analyst
cares about most — the query root is therefore always available, and the missing table is
reached only through a `<link-entity>` on `regardingobjectid`. Only "which process applies"
is rooted on the missing table.

*Established by: reading `OutcomeHandler`, `RecordTypeHandler` and `OnTaskCreate`.*

### FN-3 — The engine requires a complete fetch envelope, by string surgery

`CheckFilter` locates `</entity></fetch>` (or the same with one space) by text search,
truncates there, appends its own record-pinning filter, and executes the result. A stored
value lacking that tail yields `IndexOf` of −1 and a `Substring(0, −1)` that throws.

Whatever compiles a rule into a condition must emit the full envelope. Whitespace is not a
risk: `CommomMethods.RemoveExtrSpaces` collapses all whitespace on save, on both the step
and route validators, which is why exactly those two spellings are checked.

*Note:* the designer's fallback condition builder currently emits a bare `<filter>`
fragment, which would crash the engine. It has never fired because no non-default route on
the org was built through that path. Recorded as RISK-3.

### FN-4 — Three of the four entity and field pickers already tolerate a table that does not exist

| Picker | Reads from | Tolerates a planned entity? |
|---|---|---|
| Entity picker | `crmi_autonumber_system_entities` (config rows) | **Yes** |
| Wiring fields (regarding, outcome, comments, assign-to) | `crmi_autonumber_entities_fields` (config rows) | **Yes** |
| Condition builder — CRM Advanced Find | needs a real `objectTypeCode` | No |
| Condition builder — built-in fallback | `EntityDefinitions(…)/Attributes` (live metadata) | No |

The blocker is narrow: **the condition builder's field list**. Everything else in the
designer is already happy to name a table that is not there.

### FN-5 — The designer already builds the structure this feature needs, then discards it

The fallback condition builder holds the condition as a `RuleGroupType` object and renders
it to FetchXML through `formatAsFetchXml`. Only the rendered string is persisted. Keeping
the object is most of the work of FR-10.

### FN-6 — The route table is already a decision table

Route selection iterates routes ordered by `qdb_sequencenumber`, takes the first whose
filter matches, and otherwise returns the one flagged `qdb_isdefaultcondition`. That is
DMN's FIRST hit policy with a catch-all rule. Each route record is a rule; its filter is
the input entries; `qdb_nextworkitemstep` is the output. This matters because it makes a
decision-table editor a natural surface for both modes rather than a new concept.

### FN-7 — The SOP model is already shaped like BA Mode, and has no conditions 🔴

`qdb_sop` carries only a **nullable** `qdb_recordtype_id`, so an SOP already exists without
an application. `qdb_sopstep` has 34 custom columns and **none of them is a filter or
condition**. The SOP designer's `subprocess` step type is `qdb_steptypecode` = 100000008 on
`qdb_sopstep` — our own column on our own documentation entity, not on the executable
`qdb_work_item_steps`, and therefore with no engine behaviour behind it.

This makes "should BA Mode be the SOP designer grown up?" a live architectural question
rather than a rhetorical one. Raised as OQ-4.

### FN-8 — The wizard's requested entity filters have no data source 🔴

The enhancement backlog asks the Developer Mode wizard to show "only entities where
Process Enabled = Yes" and "only entities where Process Step Enabled = Yes".
**Neither flag exists.** `crmi_autonumber_system_entities` carries `crmi_logical_name`,
`crmi_name`, `qdb_objecttypecode`, `qdb_entityalias`, `qdb_entityschemaname`,
`qdb_activestatus`, `qdb_checkchildentities`, `qdb_recordidentifierattribute`,
`qdb_subjectfield` and `qdb_taskrefnofield` — and nothing resembling a process-eligibility
boolean.

The table holds **502 rows**, which is why the filter is wanted: the picker currently
offers every entity in the org. Satisfying FR-31 and FR-32 therefore requires a decision
about where eligibility is recorded. Raised as OQ-2.

The Regarding Field requirement is unaffected and buildable today:
`crmi_autonumber_entities_fields` carries `crmi_entity_id` and `crmi_fieldtype`, which is
enough to offer only lookup fields on the chosen application entity.

---

## 4. SCOPE

### 4.1 In scope

- Two authoring modes on one process model, with a binding step between them.
- Conditions authored as structured rules against declared business fields.
- Compilation of those rules into the FetchXML the engine already consumes.
- A publish gate that refuses an unbound process.
- The Developer Mode fields in the New Process Wizard (application entity, task entity,
  regarding field), subject to OQ-2.

### 4.2 Out of scope

- **Changing the engine.** Nothing in DP-6 requires the platform team. Rules compile to the
  FetchXML the engine already runs; it never learns that modes exist.
- **Running DMN or FEEL at runtime.** The engine evaluates FetchXML via `RetrieveMultiple`;
  a FEEL interpreter inside the plugin would be an engine change and is excluded.
- The other three new features in the same backlog — Multiple Next Steps from one
  decision, Clone from SOP, and Application Owner assignment. Each needs its own BRD.
  Application Owner in particular is **not buildable by us**: `qdb_task_assign_to` has six
  values (Specific User, Queue, Team, Read From Parent, Apply Round Robin, NA) and
  Application Owner is not among them, so it needs a new option value *and* engine
  resolver code.
- The bug-fix and enhancement items in that backlog, which take the fast paths.

---

## 5. FUNCTIONAL REQUIREMENTS

### 5.A — The mode model

| Ref | Requirement | Priority |
|---|---|---|
| FR-01 | A process is a single model. Modes differ by how complete its **binding** is, not by which editor opened it. | Must |
| FR-02 | In BA Mode a process may be created, saved, reviewed, versioned and approved with no application entity, no task entity and no regarding field. | Must |
| FR-03 | In Developer Mode those three are required and validated. | Must |
| FR-04 | Mode is a property of the process, visible on the process list, and switchable in either direction without data loss. | Must |
| FR-05 | Switching to Developer Mode must not silently discard an unbound rule; unbound rules survive and are surfaced for binding. | Must |

### 5.B — Authoring conditions without a table

| Ref | Requirement | Priority |
|---|---|---|
| FR-10 | A condition is stored as a **structured rule** — field reference, operator, value, with and/or nesting — not as FetchXML. | Must |
| FR-11 | FetchXML becomes a **compiled artifact** regenerated from the rule, never the source of truth. | Must |
| FR-12 | A rule references a **declared business field** (name, data type, and for choices its permitted values), not a column name. | Must |
| FR-13 | The analyst may declare business fields without any table existing. Location per OQ-1. | Must |
| FR-14 | Where a real entity is already known, the analyst may bind directly and skip declaration (subject to OQ-3). | Should |
| FR-15 | Rule expressiveness is limited to what compiles losslessly to a FetchXML condition: comparison, range, list membership, equality, negation, null tests. Cross-field arithmetic is explicitly excluded. | Must |

### 5.C — Binding and the publish gate

| Ref | Requirement | Priority |
|---|---|---|
| FR-20 | A binding view maps each declared business field to a real entity and attribute. | Must |
| FR-21 | Binding completeness is computed and displayed per process, per step and per rule. | Must |
| FR-22 | **A process with any unbound rule cannot be published.** | Must |
| FR-23 | While a rule is unbound, `qdb_applyfilter` must remain false on the corresponding record, so the engine never encounters an unresolved condition even if the process is published by another route. | Must |
| FR-24 | The Publish action is hidden in BA Mode. | Must |
| FR-25 | Compilation emits the complete fetch envelope required by FN-3, with the correct root per scope from FN-2. | Must |
| FR-26 | A compiled condition is re-compilable: rebinding a field and recompiling must produce a correct condition without re-authoring the rule. | Must |

### 5.D — New Process Wizard

| Ref | Requirement | Priority |
|---|---|---|
| FR-30 | The wizard offers a Developer Mode toggle. | Must |
| FR-31 | With Developer Mode on, an Application Entity picker is shown, restricted to process-eligible entities. **Blocked on OQ-2.** | Must |
| FR-32 | With Developer Mode on, a Task Entity picker is shown, restricted to process-step-eligible entities. **Blocked on OQ-2.** | Must |
| FR-33 | A Regarding Field picker offers only lookup fields belonging to the selected Application Entity. Buildable today per FN-8. | Must |
| FR-34 | With Developer Mode off, none of FR-31 to FR-33 is shown or required. | Must |

### 5.E — Validation

| Ref | Requirement | Priority |
|---|---|---|
| FR-40 | Publishing a process containing configuration errors is blocked, and the affected steps are named. | Must |
| FR-41 | A rule with no condition cannot be saved — the platform rejects it server-side with *"Please add any condition in filter"*, so the designer must refuse it first with a clearer message. | Must |
| FR-42 | Binding a declared field to an attribute of an incompatible data type is blocked. | Must |

---

## 6. NON-FUNCTIONAL REQUIREMENTS

| Ref | Requirement |
|---|---|
| NFR-01 | No engine change. No new plugin, no new registration, no platform-team dependency. |
| NFR-02 | Every process already on the org keeps its current meaning and remains publishable. Existing FetchXML conditions are not rewritten on load. |
| NFR-03 | A condition the rule model cannot represent must degrade to "edit in Advanced Find" and be preserved byte-for-byte — never silently dropped or rewritten. |
| NFR-04 | Compilation is deterministic: the same rule and binding always produce the same FetchXML. |

---

## 7. ASSUMPTIONS

| Ref | Assumption | If wrong |
|---|---|---|
| AS-01 | Analysts will accept declaring a business field before using it in a rule. | The feature needs a lighter free-text path and loses its structure. |
| AS-02 | Most processes eventually bind to an entity that does exist. | FR-14 becomes the main path rather than a convenience. |
| AS-03 | org5869857f remains a design and configuration environment; correctness is judged by compiled output, not by execution. | Runtime verification must be added, on an environment where the engine actually runs. |

---

## 8. OPEN QUESTIONS FOR CEO DECISION

| Ref | Question | Why it must be decided before architecture | Recommendation |
|---|---|---|---|
| **OQ-1** | Where do declared business fields live — a new CWFD-owned table, or extra rows in `crmi_autonumber_*`? | Determines the schema change and who owns it. | **A new CWFD table.** `crmi_autonumber_*` belongs to the autonumbering feature; writing fictional rows into another team's data is how this project acquired its current duplication. |
| **OQ-2** | Process-eligibility flags do not exist (FN-8). Add two booleans to `crmi_autonumber_system_entities`, create a CWFD-owned eligibility list, or derive eligibility? | FR-31 and FR-32 cannot be built without an answer. 502 unfiltered rows today. | **A CWFD-owned eligibility list**, for the same reason as OQ-1. Deriving is fragile; extending another team's table needs their consent. |
| **OQ-3** | May an analyst bind directly to a real entity when one exists (hybrid), or is BA Mode always symbolic? | Changes the UI and the validation model. | **Allow the hybrid.** Forcing placeholders adds friction with no benefit. |
| **OQ-4** | Is BA Mode a mode of the process designer, or the SOP designer grown into it (FN-7)? | Decides whether this extends an existing surface or adds one. | Needs the CEO's view. SOP is already unbound and already decoupled from the engine; it lacks only conditions. The counter-argument is that two surfaces for one concept is what CWFD has been retiring. |
| **OQ-5** | Does an approved-but-unbound process carry any formal status, or is approval only meaningful post-binding? | Affects versioning and the approval model. | Recommend a distinct "Approved — design" state, separate from publishable. |

---

## 9. RISKS

| Ref | Risk | Severity | Mitigation |
|---|---|---|---|
| RISK-1 | An unbound condition reaches the engine and is evaluated against a table that does not exist. | **High** | FR-22 and FR-23 together — the gate plus the `qdb_applyfilter` interlock, so a failure of the gate alone is not sufficient to cause it. |
| RISK-2 | Analysts declare fields that never map cleanly to the eventual schema, and binding becomes a rewrite. | Medium | FR-12 requires a data type on declaration; FR-42 blocks incompatible binds early. |
| RISK-3 | The existing fallback condition builder emits a bare `<filter>` fragment, which crashes `CheckFilter` (FN-3). Independent of DP-6 but shares the code path. | **High** | Fix separately and before DP-6 build starts; it is a defect, not a feature. |
| RISK-4 | Scope creep into a general rules engine. | Medium | FR-15 caps expressiveness at what compiles to a FetchXML condition. |
| RISK-5 | OQ-2 is answered by extending another team's table, creating a cross-team dependency mid-build. | Medium | Decide OQ-2 at the gate, not during build. |

---

## 10. ACCEPTANCE CRITERIA

1. An analyst creates a complete process — steps, outcomes, routes and routing conditions —
   with no application entity selected, saves it, reopens it unchanged, and has it reviewed.
2. That process cannot be published, the Publish action is not offered, and the reason
   names the unbound rules.
3. A developer binds each declared field to a real entity and attribute; the process
   becomes publishable with no re-authoring of any rule.
4. The compiled FetchXML for a bound rule is byte-comparable with what Advanced Find
   produces for the same condition, including the closing entity and fetch tail.
5. An existing process on the org opens, saves and publishes with its conditions unchanged.
6. A rule the model cannot represent opens in Advanced Find and round-trips unmodified.
7. Every rule in a published process has `qdb_applyfilter` true and a compiled filter;
   no published process has an unbound rule.

---

## 11. TRACEABILITY

Supporting analysis, all produced 2026-08-13 to 2026-08-18:

- `cwfd-005-runtime/engine-contract.md` — execution contract (§4, §5 and §6 carry corrections)
- `cwfd-005-runtime/platform-team-questions.md` — the eight questions; Q7 gates DP-4, not DP-6
- `cwfd-005-runtime/dp-3-human-task-depth.md` §6 — dead branches, including Queue
- `scripts/probe-engine-wiring.js` — re-runnable org probe backing FN-1, FN-2, FN-4 and FN-8

---

## 12. CEO DECISION REQUESTED

Approve, approve with conditions, revise or reject — and rulings on **OQ-1 through OQ-5**.
OQ-2 in particular blocks FR-31 and FR-32; the remainder of the feature can proceed without it.
