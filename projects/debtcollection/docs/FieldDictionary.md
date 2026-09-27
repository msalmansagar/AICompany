# DCP — Target Field Dictionary (Phase 0) — Index

**Status:** proposal · 2026-09-17 · Master Prompt §71 · nothing provisioned. Names, types and decisions
follow `TargetArchitecture.md`, `ERD.md`, `EntityDictionary.md` and `MISIntegration.md` §4 exactly.
Split into four parts to keep each file under the 400-line guideline.

| Part | File | Entities |
|---|---|---|
| 1 | `FieldDictionary-Transaction.md` | `qdb_collectioncase` · `qdb_collectionactivity` · `qdb_delinquencysnapshot` |
| 2 | `FieldDictionary-Configuration.md` | `qdb_collectionactivitytype` · `qdb_activityoutcome` · `qdb_collectionstrategy` · `qdb_strategyaction` · `qdb_assignmentconfiguration` · `qdb_communicationtemplate` |
| 3 | `FieldDictionary-Platform.md` | `qdb_platformconfiguration` · `qdb_platformmapping` · `qdb_identityexception` · `qdb_consent` (conditional). *Technical logging is **not** a new entity — it reuses the existing `qdb_crmlogs`; the mapping lives in `QdbCrmLogsReuseAssessment.md`, and the withdrawn `qdb_integrationlog` table remains in this part under a "historical only" heading.* |
| 4 | `FieldDictionary-SystemExtensions.md` | `qdb_` extensions on `contact` / `account` · optional `qdb_` columns on `fax` / `email` · reuse of existing system columns |

## Column legend (used in every part)

The **Entity** is the heading above each table (one table per entity).

| Column | Meaning / codes |
|---|---|
| Display · Logical | Display name · logical name (`qdb_` prefix; system columns as-is) |
| Type · Len | Dataverse attribute type · max length or precision (`money` = 4 dp, `dec(p,s)`) |
| Req | **R** = Application/Business Required · **O** = optional · **S** = system-required |
| Default | value on create, or — |
| Src | **U** user · **M** MIS (via canonical model) · **D** derived · **P** plugin · **C** configuration/admin · **S** system · **I** integration service |
| Edit | **Y** editable · **N** never after create · **RO** read-only for users (set by system/plugin) |
| Sec | — · **PII** (mask by role) · **FS** field-secured profile · **RO** read-only |
| HL · BFD | applicability in each organisation (**Y** / **N** / **Cond**) |
| OP · CL | On-Prem 9.1 / Cloud compatibility — **CbD** = Compatible by Design (runtime test pending on-prem) unless a limitation is named |
| IntMap | canonical MIS field (`MISIntegration.md` §4.1) or — |
| MigSrc | the `msst_` column migrated from, or **new** |

## Conventions binding all parts

- Every custom entity carries system `createdby`, `createdon`, `modifiedby`, `modifiedon`, `ownerid`
  (user-owned) or `organizationid` (org-owned), `statecode`, `statuscode`, `versionnumber`. They are listed
  once here, not repeated per entity. All primary keys are GUIDs.
- **PTP core fields are physical** on `qdb_collectionactivity` (date, promised amount, promise type,
  status, amount received, payment date, broken date/reason, reschedule count, previous date, reminder
  date, supervisor escalated) because automation queries them. **Descriptive fields for PTP, field
  visit, restructuring, legal, deceased/insurance and complaint/dispute are Form Engine configuration**
  (Master Prompt §26–31, §45), not physical columns; the activity references the Form Engine submission.
- Option **values** are publisher-bound; migration maps `msst_` choices by label/code, never by integer.
- Where a value is unknown the text `TBD — Requires QDB Confirmation` is used verbatim.
- Autonumber (`AutoNumberFormat`) is available from v9.0 on both platforms and is used for case and
  activity numbers.
- Multi-select choice columns (v9.0+ on both platforms) are used only for *applicability* lists on
  configuration entities.
