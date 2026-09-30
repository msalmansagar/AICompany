# External process reference — Complaint and Legal across organisations

Status: approved by the user 2026-09-29 (Asia/Qatar) under the conditions of the brief "correcting the
DCP Complaint and Legal cross-organization reference architecture". Started 21:25.

## Architecture

- **DCP is deployed to both organisations, from one solution.** HL CRM: individual customers
  (contact), HL Loan Account. BFD CRM / QDB1: corporate/SME customers (account), Facility. The
  organisation's `qdb_platformconfiguration` row says which one it is.
- **BFD CRM hosts two enterprise processes for both populations:** Case Management (complaints)
  and Legal. Neither exists in HL CRM, neither is copied there, neither is recreated in DCP.
- **Every link from a Collection Activity to a Complaint or a Legal record is an external process
  reference**, for HL and BFD alike — never a native lookup. One schema, one service contract,
  one screen, one test model, one package.
- Creation and status reads go through the Integration Service, acting as the signed-in user in
  each organisation. React never authenticates to BFD CRM.

## 1. Inspection (sandbox org5869857f, 2026-09-29)

| # | Question | Finding |
|---|---|---|
| 1 | Complaint lookup | `qdb_collectionactivity.qdb_complaintcaseid` ("Complaint Case") |
| 2 | Target | `incident` |
| 3 | Legal lookup | `qdb_collectionactivity.qdb_legalrequestid` ("Litigation Request") |
| 4 | Target | `qdb_qdblegal` |
| 5 | Plugins | **None.** No C# code, no plugin step and no workflow on `qdb_collectionactivity` names either lookup. |
| 6 | API / services | **None** in `apps/api`. Provisioning: `provision-complaint-linkage.mjs`, `provision-legal-linkage.mjs`; smoke/seed scripts `smoke-legal-visibility.mts`, `smoke-legal-handoff.mts`, `smoke-phase9-advanced.mts`, `smoke-deceased-review.mts`, `qa-seed-concerns.mts`. |
| 7 | React | `data/caseQueries.ts`, `caseConcerns.ts`, `complaintQueries.ts`, `legalQueries.ts`, `legalTraceRows.ts`, `caseLegalTraces.ts`, `operationalQueue.ts`, `schema.ts` (bindings + queue `$expand`). All reads — no screen writes either lookup. |
| 8 | Tests | web: `operationalQueue`, `caseConcerns`, `legalQueries`, `advancedProcessBoundary`, `platform`, `deceasedReviewWrite`; domain: `complaintContract`, `legalVisibility`. |
| 9 | Forms / views | The main form **Information** (regenerated with every column by `provision-dcp-app-ux.mjs`). No view. |
| 10 | Solution dependencies | Each lookup has exactly **one** dependency blocking deletion: that form (component type 60). The legal lookup makes the solution **require `qdb_qdblegal`**, which does not exist in HL CRM — the HL import blocker. The exported solution also carries `incident`, `qdb_qdblegal`, `systemuser` and `team` because the model-driven app lists them. |
| 11 | Does Type identify the process? | **No.** The configured type "Complaint / Dispute" covers a *local* collection dispute and an *external* complaint alike (KI-118); a legal recommendation and a legal hand-off also share a type. The record type must be stored. |
| 12 | Reusable organisation / reference fields | **`qdb_relatedrecordtype` (text 50) and `qdb_relatedrecordid` (text 50) already exist** as the domain's generic `relatedRecord` — "this activity refers to another record" — used so far for fax/email. **0 rows** carry a value. Reused with the same meaning. No organisation column exists; `qdb_origin` means *manual vs strategy generated*, not an organisation. |
| 13 | Existing values in the lookups | **0 rows** in each (`$count` on `_qdb_complaintcaseid_value ne null` and `_qdb_legalrequestid_value ne null`). |
| 14 | Migration | Nothing to migrate in the sandbox. A future org holding values would copy each into the reference (type + id + organisation of the org itself + number read once) before the lookup is removed. |
| 15 | Cloud | Two columns added, two lookups removed from `qdb_collectionactivity`; nothing else changes. |
| 16 | HL on-prem import | Unblocked once the legal lookup is gone **and** the solution no longer carries `incident` / `qdb_qdblegal` / `systemuser` / `team`. |
| 17 | BFD on-prem import | Same package; nothing BFD-specific. |

## 2. Schema — minimum change

Reused (no new column): `qdb_relatedrecordtype` = the target table's logical name (`incident`,
`qdb_qdblegal`, `fax`, `email`); `qdb_relatedrecordid` = the target record's GUID.

New:

| Display name | Logical name | Type | Length | Required | Purpose | Example | Why nothing existing fits |
|---|---|---|---|---|---|---|---|
| Related Record Organization | `qdb_relatedrecordorganization` | Choice — existing global choice `qdb_organization_code` (HL / BFD) | — | None | Which organisation holds the related record. Blank = the activity's own organisation (the fax/email case). | BFD | No organisation column exists on the activity; `qdb_origin` means something else; encoding it inside the type text would make one column mean two things. |
| Related Record Number | `qdb_relatedrecordnumber` | Text | 100 | None | The target system's human-readable number, as that system issued it. | BFD-25600-A1B2 | No column holds another record's number; the GUID is not usable by people. |

No status column: status is read from the owning module through the Integration Service.

Removed: `qdb_complaintcaseid`, `qdb_legalrequestid` — after removing them from the form, with the
evidence above (no data, no plugin, no workflow, no view, no API contract).

## 3. Service contract

- `POST /collection-cases/:id/complaints` — creates the Case in BFD Case Management, then records a
  **Collection Activity on the originating Collection Case** carrying the reference. Both writes are
  create-only under ids derived from Collection Case + user + request id, so a retry after a
  timeout completes whichever write is missing and never duplicates either. The activity is
  written only after the Case exists: DCP never shows a complaint that was not created. A failure
  between the two writes is repaired by the same retry.
- `POST /external-references/summaries` — up to 50 references per call; for each, reads the record
  in its organisation as the user and returns number, process, status, status reason, owner,
  created on, modified on and an open link built from configuration. Missing → `unavailable`,
  refused → `forbidden`.
- Legal creation: **not implemented** — the Legal field mapping has not been inspected and confirmed.
