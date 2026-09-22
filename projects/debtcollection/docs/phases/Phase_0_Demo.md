# Phase 0 — Demo / Architecture Review Package

**Purpose:** let the reviewer verify, not just read, the Phase 0 outcome. Every step is non-destructive.
All paths are relative to `D:\AI Projects\AICompany\projects\debtcollection\`.

## A. Review sequence (30–40 minutes)

| # | Step | Open / run | Expected result |
|---|---|---|---|
| 1 | The one-page summary | `docs/phases/Phase_0_Completion_Report.md` | Scope table all *Complete*; §4 decisions; §8 TBD list; §10 Phase 1 proposal; "nothing executed" |
| 2 | What exists vs what the Master Prompt wants | `docs/CurrentStateAssessment.md` | §0 platform status table; §1 eleven architecture conflicts A1–A11; §4 portability gate P1–P11 with two violations and two passes |
| 3 | Target model | `docs/TargetArchitecture.md` → `docs/ERD.md` → `docs/EntityDictionary.md` | One `qdb_customerid` Customer lookup; facility as business key + org-specific lookup; 13 target entities; retired list with reasons |
| 4 | Field-level detail | `docs/FieldDictionary.md` (index) → the four part files | ~330 fields, each with HL/BFD/on-prem/cloud applicability, migration source, MIS mapping |
| 5 | Migration plan | `docs/SchemaMigration_msst_to_qdb.md` | Every `msst_` component → target → decision → method → rollback; §3 the 16 customer fields classified per CP §6; the destructive-action list marked NOT executed |
| 6 | MIS design | `docs/MISIntegration.md` | Two paths (live, background); canonical contract from the supplied workbooks; §12 confirmed vs proposed vs TBD |
| 7 | Portability | `docs/CloudMigrationReadiness.md` | Register with exact statuses; violations KI-02/KI-03; quality-gate checklist |
| 8 | Engines and communication | `docs/EngineReuseAssessment.md`, `docs/CommunicationArchitecture.md` | Rule Engine not a blocker (Process Action path); fax/email design; Fax trigger TBD |
| 9 | Decisions record | `adrs/index.md` | ADR-01 amended, 02/03/06 superseded, 04/05 confirmed, 07–10 new — none deleted |
| 10 | Tracker | `DebtCollection_Project_Tracker.xlsx` | 7 sheets; Phase 0 *Ready for Review*; no mock marked implemented; dual-platform columns populated |
| 11 | The data behind the design | `docs/HousingLoanDataAnalysis.md` | Bucket table ties to the Breakdown sheet to the riyal; F1–F11 findings; §5 the eight specific MIS/QDB questions. Replay: `node analyze-hl.js` (session scratchpad) reproduces every figure read-only |

## B. Evidence you can replay

### B1. Test baseline (Master Prompt §87) — unchanged tests

```bash
cd "D:/AI Projects/AICompany/projects/debtcollection"
npm ci && npm test            # expect: @dcp/api 19 · @dcp/auth-adapters 14 · @dcp/dataverse-client 12 — all pass
cd crm/plugins && dotnet test Qdb.DebtCollection.Plugins.Tests/Qdb.DebtCollection.Plugins.Tests.csproj   # renamed in Phase 1 (was Msst.*)
                              # expect: Passed 92, Failed 0, Skipped 0
```

### B2. Cloud smoke (writes SMOKE rows to the shared sandbox — run only if that is acceptable)

```bash
cd "D:/AI Projects/AICompany/projects/debtcollection/crm/scripts"
node --env-file=<path-to-.env> smoke-plugins.mjs
# expect 14/15 — FAIL "flag flip moved the parked case to Deceased/Insurance Review automatically"
# (queue move refused: msst_dcpcollectioncase IsValidForQueue = false — KI-01)
```

Note: the smoke test cannot clean up after itself (ImmutabilityGuard blocks deletes) — the lesson recorded
in `docs/TestingStrategy.md`.

### B3. Portability findings are real — see them in source

```bash
cd "D:/AI Projects/AICompany/projects/debtcollection"
grep -rn "apiVersion: '9.2'\|/api/data/v9.2" apps/api/src        # 4 constants + 1 literal (KI-02)
grep -n "login.microsoftonline.com" crm/scripts/lib/crm-client.mjs  # Entra-only tooling auth (KI-03)
grep -rnE "System\.IO|Registry|SqlConnection|HttpClient" crm/plugins/Qdb.DebtCollection.Plugins --include=*.cs   # renamed in Phase 1 (was Msst.*)
                                                                   # (empty) — plugins pass the §57 scan
```

### B4. Customer lookup is supported on both platforms

```bash
grep -ao "CreateCustomerRelationships[A-Za-z]*" \
  "C:/Users/salma/.nuget/packages/microsoft.crmsdk.coreassemblies/9.0.2.51/lib/net462/Microsoft.Xrm.Sdk.dll" | sort -u
# expect: CreateCustomerRelationshipsRequest / CreateCustomerRelationshipsResponse (on-prem 9.x SDK)
# cloud: the CreateCustomerRelationships action is present in org5869857f $metadata (checked read-only 2026-09-17)
```

### B5. The supplied MIS data, profiled

Open `HousingLoanArrearReportDetailed.xlsx` → sheet *Housing Loan Arrear Detailed*: 4,357 rows, 23
columns; *Arrear Buckets* shows `2026-01-30` where `1-30` is meant (Excel artefact the adapter must
normalise); *Account Status* has only `7` and `8` (meaning TBD); totals tie to the Breakdown sheet
(Total Arrears QAR 213,037,773.69).

## C. Things the demo deliberately does **not** do

- No `qdb_` component is created; no `msst_` component is deleted; no plugin is re-registered.
- No Phase 1 code exists; no React workspace exists; the prototype remains a mock.
- No on-prem environment is touched (none is available to this machine).

## C1. What the F1–F11 review changed (read after step 2)

| Read | To see |
|---|---|
| `docs/HousingLoanDataAnalysis.md` §2a | the three statements demoted from conclusion to recommendation, and every finding's "Status after review" line |
| `docs/TargetArchitecture.md` §1 (principles 5a/5b/5c), §4 diagram, §4.1 | eligibility in the flow; "thresholds are configuration, never source"; the cross-platform principle |
| `docs/MISIntegration.md` §5a | the six eligibility outcomes and where they sit |
| `adrs/ADR-11-collection-eligibility.md` | the decision record |
| Tracker sheet *Contradictions* | C-01…C-08, two of them open for QDB |

## D. Review questions to answer at the gate

1. Approve the single `qdb_customerid` Customer lookup design?
2. Approve placing the Collection flags (`qdb_stopcontact`, deceased, vulnerability, special handling,
   language) on contact and account?
3. Approve the facility approach (`qdb_facilitynumber` + org-specific lookup)?
4. Approve native audit replacing `msst_dcpauditlog`, and PTP as an activity type?
5. Which on-prem 9.1 organisation may DCP use, and is the HL facility entity name available? (BFD
   candidate `qdb_account` — confirm.)
6. Is the BFD legacy **DA collections module** (`qdb_da_case` …) live? Approve `qdb_collectioncase` as its
   successor, frozen-not-deleted, with a Phase 2 coexistence/migration assessment?
7. Approve the `qdb_crmlogs` reuse mapping and any proposed extension columns (`QdbCrmLogsReuseAssessment.md`)?
8. Approve **ADR-DCP-11** — the Collection Eligibility / Grace evaluation as a Rule Engine ruleset with six
   outcomes, recorded on the snapshot, adding no entity and no engine?
9. **C-01 / C-02:** authorise the BRD amendments — FR-034 (exposure) re-cast as an HL configuration default,
   and FR-026 / FR-132 (">2000 DPD") re-cast as configuration rather than constants?
10. Release Phase 1?

### B6. The existing BFD schema is really there (read-only)

```bash
# EntityDefinitions has no server-side startswith filter — count client-side
node --env-file=<path-to-.env> --input-type=module -e "…list EntityDefinitions, filter LogicalName startsWith 'qdb_'…"
# expect ≈ 909 qdb_ entities incl. qdb_facility, qdb_account, qdb_da_case, qdb_collections_task,
# qdb_npl, qdb_customer_mis, qdb_crmlogs (1,295 rows) — see docs/ExistingQdbSchemaAssessment.md
```
