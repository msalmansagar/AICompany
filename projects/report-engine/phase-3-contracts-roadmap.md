# Phase 3 Architecture — API Contracts, Samples, Roadmap (Workstream 4 of 4)

| | |
|---|---|
| **Engagement** | RPT-ENG-001 (report-engine) |
| **Document** | Execution API contracts, sample report definition, sample queries, external merge, output, roadmap, effort, risks, best practices |
| **Date** | 2026-07-07 |

Consistent scenario throughout: **"Active Loan Applications by Branch"** — main entity `qdb_loanapplication` (child of `account`), grouped by branch, sum of requested amount, filtered to active status + created in the last 90 days + a branch parameter.

---

## 1. Execution API contracts

Two entry points, one engine:
- **CRM Custom API** `qdb_ExecuteReport` (cloud) / **Custom Action** `qdb_ExecuteReport` + plugin (on-prem) — thin; forwards to the middle tier.
- **Middle-tier REST** (`/api/v1`) — does the real work. Auth: **bearer JWT** minted from the CRM user identity (S2S / on-behalf-of); every call carries `X-Correlation-Id`.

### 1.1 Execute (synchronous) — light CRM-native reports
`POST /api/v1/reports/{reportId}/execute`
```json
// request
{
  "versionId": "b2f1...optional-defaults-to-current",
  "parameters": { "branchId": "6f9e2c11-...", "dateFrom": "2026-04-08", "dateTo": "2026-07-07" },
  "page": { "number": 1, "size": 100 },
  "context": { "userId": "a1..", "businessUnitId": "c3..", "recordId": null, "entityName": null }
}
// response 200
{
  "correlationId": "3af9-...",
  "reportId": "d5a0-...",
  "versionId": "b2f1-...",
  "status": "Success",              // Success | Partial | Failed
  "isPartial": false,
  "columns": [ /* see §5 */ ],
  "rows": [ /* see §5 */ ],
  "groups": [ /* see §5 */ ],
  "aggregates": { "qdb_requestedamount__sum": 128450000.00 },
  "page": { "number": 1, "size": 100, "totalRows": 342, "hasMore": true },
  "warnings": []
}
```

### 1.2 Submit async job — heavy / external reports
`POST /api/v1/reports/{reportId}/jobs` → `202 Accepted`
```json
{ "jobId": "job_8c2f-...", "status": "Queued", "statusUrl": "/api/v1/jobs/job_8c2f-...", "correlationId": "3af9-..." }
```

### 1.3 Poll job status
`GET /api/v1/jobs/{jobId}` →
```json
{ "jobId": "job_8c2f-...", "status": "Running", "progress": 0.6, "resultUrl": null }
// when done: "status": "Succeeded", "resultUrl": "/api/v1/jobs/job_8c2f-.../result", "fromCache": false
```

### 1.4 Fetch result page
`GET /api/v1/jobs/{jobId}/result?page=1&size=100` → same body shape as §1.1.

### 1.5 Export
`POST /api/v1/reports/{reportId}/export`
```json
// request
{ "versionId": null, "parameters": { /* … */ }, "format": "PDF" }   // PDF|Excel|CSV|Word|Image|HTML
// response 200: binary stream + headers
//   Content-Type: application/pdf
//   Content-Disposition: attachment; filename="ActiveLoanApplicationsByBranch_2026-07-07.pdf"
//   X-Correlation-Id: 3af9-...
```

### 1.6 Error schema (typed — never raw platform errors)
```json
{
  "error": {
    "code": "ROW_LIMIT_EXCEEDED",     // stable machine code
    "message": "The report returned more than 50,000 rows. Add a filter or use a pre-aggregated source.",
    "correlationId": "3af9-...",
    "details": { "rowLimit": 50000 }
  }
}
```
Codes: `UNAUTHORIZED`, `REPORT_NOT_PUBLISHED`, `SOURCE_UNAVAILABLE`, `ROW_LIMIT_EXCEEDED`, `TIMEOUT`, `AGGREGATE_CAP_EXCEEDED`, `INVALID_PARAMETER`, `EXPORT_FAILED`, `PARTIAL_RESULT`.

### 1.7 CRM Custom API signature — `qdb_ExecuteReport`
| Parameter | Direction | Type | Notes |
|---|---|---|---|
| ReportId | Input | String (GUID) | Required |
| VersionId | Input | String | Optional (defaults to current) |
| ParametersJson | Input | String | JSON param bag |
| Mode | Input | Picklist | Auto/Sync/Async |
| ContextJson | Input | String | recordId/entityName/selectedIds from ribbon |
| Format | Input | Picklist | Optional (export) |
| ResultJson | Output | String | Sync result or `{jobId}` for async |
| CorrelationId | Output | String | |
Bound to none (global); plugin forwards to the middle tier with the caller's identity.

---

## 2. Sample JSON report definition (`qdb_reportversion.qdb_snapshotjson`)
```json
{
  "definition": {
    "name": "Active Loan Applications by Branch",
    "category": "Operational",
    "module": "Lending",
    "mainEntityLogicalName": "qdb_loanapplication",
    "isGoverned": true,
    "rowLimit": 50000,
    "executionMode": "Auto"
  },
  "dataSources": [
    { "name": "Applications", "sourceType": "FetchXML", "isPrimary": true, "sequence": 1,
      "targetEntityLogicalName": "qdb_loanapplication", "queryText": null }
  ],
  "entityMappings": [
    { "alias": "app", "entityLogicalName": "qdb_loanapplication", "role": "Primary" },
    { "alias": "branch", "entityLogicalName": "account", "role": "Related",
      "relationshipSchemaName": "qdb_account_qdb_loanapplication_branch" }
  ],
  "columns": [
    { "name": "Application No", "sourceAttribute": "qdb_applicationnumber", "dataType": "Text", "sequence": 1, "alignment": "Left" },
    { "name": "Branch", "entityAlias": "branch", "sourceAttribute": "name", "dataType": "Text", "sequence": 2 },
    { "name": "Status", "sourceAttribute": "statuscode", "dataType": "OptionSet", "sequence": 3 },
    { "name": "Requested Amount", "sourceAttribute": "qdb_requestedamount", "dataType": "Currency",
      "format": "#,##0.00", "alignment": "Right", "aggregation": "Sum", "sequence": 4 },
    { "name": "Created On", "sourceAttribute": "createdon", "dataType": "DateTime", "format": "dd/MM/yyyy", "sequence": 5 }
  ],
  "parameters": [
    { "name": "branchId", "prompt": "Branch", "parameterType": "Lookup", "lookupTargetEntity": "account", "isRequired": false },
    { "name": "dateFrom", "prompt": "Created From", "parameterType": "DateRange", "isRequired": true,
      "defaultValue": "LastXDays:90" }
  ],
  "filters": [
    { "attribute": "statuscode", "operator": "Equals", "value": "1", "logicalGroup": 0, "andOr": "And", "sequence": 1 },
    { "attribute": "createdon", "operator": "LastXDays", "value": "90", "logicalGroup": 0, "andOr": "And", "sequence": 2 },
    { "attribute": "qdb_branchid", "operator": "Equals", "parameter": "branchId", "logicalGroup": 0, "andOr": "And", "sequence": 3 }
  ],
  "transformations": [
    { "transformationType": "OptionSetResolve", "targetColumn": "Status", "sequence": 1 },
    { "transformationType": "CurrencyFormat", "targetColumn": "Requested Amount", "configJson": "{\"symbol\":\"QAR\"}", "sequence": 2 },
    { "transformationType": "Grouping", "targetColumn": "Branch", "sequence": 3 },
    { "transformationType": "Aggregation", "targetColumn": "Requested Amount", "configJson": "{\"op\":\"Sum\"}", "sequence": 4 }
  ],
  "formulas": [],
  "layouts": [
    { "layoutType": "Grouped", "showHeader": true, "showFooter": true, "showLogo": true,
      "showPageNumber": true, "showGeneratedDate": true, "pageOrientation": "Landscape", "pageSize": "A4",
      "layoutConfigJson": "{\"groupBy\":\"Branch\",\"groupTotals\":[\"Requested Amount\"],\"grandTotal\":true}" }
  ],
  "exportSettings": [
    { "format": "PDF", "isEnabled": true, "filenameTemplate": "{report}_{date}" },
    { "format": "Excel", "isEnabled": true, "filenameTemplate": "{report}_{date}" }
  ],
  "security": [
    { "principalType": "SecurityRole", "principalRef": "Lending Officer", "canView": true, "canRun": true, "canExport": true },
    { "principalType": "SecurityRole", "principalRef": "Lending Manager", "canView": true, "canRun": true, "canExport": true, "canApprove": true }
  ]
}
```

---

## 3. Sample FetchXML + QueryExpression (the abstraction picking each)

**FetchXML** (chosen: simple filter/sort + one related entity + group/sum within cap):
```xml
<fetch aggregate="true">
  <entity name="qdb_loanapplication">
    <attribute name="qdb_requestedamount" alias="sum_amount" aggregate="sum" />
    <attribute name="qdb_branchid" alias="branch" groupby="true" />
    <filter type="and">
      <condition attribute="statuscode" operator="eq" value="1" />
      <condition attribute="createdon" operator="last-x-days" value="90" />
      <condition attribute="qdb_branchid" operator="eq" value="{branchId}" />
    </filter>
  </entity>
</fetch>
```
> If the branch grouping pushed the set past FetchXML's aggregate cap, `IQueryStrategySelector` falls back to **QueryExpression** (raw rows, group in-engine) or a **PreAggregated** source.

**QueryExpression** (SDK path, raw rows for in-engine grouping):
```csharp
var query = new QueryExpression("qdb_loanapplication")
{
    ColumnSet = new ColumnSet("qdb_applicationnumber","qdb_branchid","statuscode","qdb_requestedamount","createdon"),
    Criteria = new FilterExpression(LogicalOperator.And)
    {
        Conditions =
        {
            new ConditionExpression("statuscode", ConditionOperator.Equal, 1),
            new ConditionExpression("createdon", ConditionOperator.LastXDays, 90),
            new ConditionExpression("qdb_branchid", ConditionOperator.Equal, branchId)
        }
    },
    Orders = { new OrderExpression("qdb_branchid", OrderType.Ascending) },
    PageInfo = new PagingInfo { Count = 5000, PageNumber = 1, PagingCookie = null }
};
var link = query.AddLink("account", "qdb_branchid", "accountid", JoinOperator.Inner);
link.EntityAlias = "branch"; link.Columns = new ColumnSet("name");
```

---

## 4. Sample external API data merge (V2/V3 — Core Banking balances by customer number)
1. **CRM query** (primary): applications + `qdb_customernumber`.
2. **Connector call** (`qdb_externalconnector` type=CoreBanking, auth via Key Vault ref):
```json
// request  POST {baseUrl}/balances:batch   Authorization: Bearer {from Key Vault}
{ "customerNumbers": ["CUS-1001","CUS-1002","CUS-1003"] }
// response 200
{ "balances": [
  { "customerNumber": "CUS-1001", "outstanding": 250000.00, "currency": "QAR" },
  { "customerNumber": "CUS-1002", "outstanding": 0.00, "currency": "QAR" }
]}
```
3. **In-engine join** (`ISourceCombiner`, hash join on `qdb_customernumber` ↔ `customerNumber`) yields merged rows. `CUS-1003` had no balance → null-handled; if the connector is down, primary rows return with `isPartial=true` and a `PARTIAL_RESULT` warning (R-3, C-6).

---

## 5. Sample normalized output structure (engine → renderer)
```json
{
  "columns": [
    { "name": "qdb_applicationnumber", "displayName": "Application No", "type": "Text" },
    { "name": "branch_name", "displayName": "Branch", "type": "Text" },
    { "name": "statuscode", "displayName": "Status", "type": "Text" },
    { "name": "qdb_requestedamount", "displayName": "Requested Amount", "type": "Currency", "format": "#,##0.00" }
  ],
  "groups": [
    { "key": "Branch", "value": "Doha Main", "rows": [
        { "qdb_applicationnumber": "LA-24001", "branch_name": "Doha Main", "statuscode": "Active", "qdb_requestedamount": 1500000.00 }
      ],
      "aggregates": { "qdb_requestedamount__sum": 42300000.00 } }
  ],
  "aggregates": { "qdb_requestedamount__sum": 128450000.00 },
  "isPartial": false,
  "warnings": []
}
```

---

## 6. Phased implementation roadmap

| Milestone | Scope (BRD cut) | Entry criteria | Exit criteria |
|---|---|---|---|
| **M0 — Foundations** | Solution + 18-table schema provisioned; middle-tier skeleton; CRM Custom API/Action; auth (JWT). Two spikes: **export-parity (C-7)** + **NCalc sandbox (C-5)**. | CEO conditions logged | Schema deployed to dev; spikes pass; a hello-world report runs sync |
| **M1 — V1 core (tabular/grouped)** | Designer (header/entity/columns/filters/params/sort/group/agg/preview/publish/version/clone); FetchXML+QueryExpression+WebApi providers; filter/param + core transforms; table/grouped/summary layouts | M0 done | Power user authors + runs a CRM report end-to-end, zero dev |
| **M2 — V1 export + ribbon + governance** | PDF/Excel/CSV/**Word/Image**/HTML export; form+home-grid ribbon + context; RBAC/owner/approver/audit/exec-history/masking | M1 done | Full V1 acceptance; export parity on-prem+cloud |
| **M3 — SSRS migrate simple tier** | Inventory + classify (FR-114/115); migrate "simple" reports; parity checklist | M2 done | ≥ agreed % of simple reports live on the engine |
| **M4 — V2** | Multi-level drilldown, N:N, manual joins, sub-reports; formulas; conditional formatting; card/master-detail/chart layouts; Custom API/SQL/REST sources; Redis cache; approver workflow; advanced conditions | M2 done | V2 acceptance |
| **M5 — V3 + complex migration** | Core Banking/MIS/middleware connectors; external key mapping + cross-source combine; JSON flatten/pivot; dashboard + letter/document layouts; migrate "complex" SSRS tier | M4 done | Programme complete |

---

## 7. Effort estimation (indicative person-days)

| Module | V1 | V2 | V3 |
|---|---|---|---|
| Schema + solution + provisioning | 8 | 3 | 3 |
| Middle-tier service (host, auth, jobs, cache) | 15 | 8 | 5 |
| CRM entry points (Custom API/Action + plugins) | 8 | 3 | 2 |
| Data provider layer + FetchXML abstraction | 12 | 8 | 10 |
| Drilldown/relationship engine | 5 | 12 | 8 |
| Filter/parameter engine | 8 | 5 | — |
| Transformation engine + NCalc | 10 | 10 | 10 |
| Layout/rendering engine | 10 | 12 | 12 |
| Export engine (5 formats V1) | 14 | 4 | 4 |
| Designer web resource (React/Fluent) | 25 | 15 | 12 |
| Ribbon integration | 5 | 3 | — |
| Security/governance/audit | 8 | 6 | 3 |
| External connectors | — | 10 | 18 |
| QA/test automation | 15 | 12 | 12 |
| **Subtotal** | **≈151** | **≈111** | **≈99** |

**V1 MVP range: ~150–190 person-days** (≈ 7–9 months for a 2–3 dev + 1 QA squad, incl. buffer). **SSRS migration programme** (300 reports): inventory+classify ≈ 15–25 pd; simple-tier migration ≈ 0.25–0.5 pd/report; complex ≈ 1–3 pd/report — sized after classification (M3).

Assumptions: middle tier hostable on-prem + Azure; external API contracts provided; 1 shared designer squad; no pixel-perfect letters in V1.

---

## 8. Risks & mitigations (carried from BRD + architecture-level)

| Risk | Architecture mitigation |
|---|---|
| R-1 2-min plugin ceiling vs heavy work | Thin CRM entry point; all heavy work in the middle tier; async/staged path + cache (C-6) |
| R-2 FetchXML limits | `IQueryStrategySelector` routes to QueryExpression/WebApi/CustomApi/PreAggregated |
| R-3 External latency/availability | Staging + cache; per-connector timeout + circuit breaker; `isPartial` graceful degradation |
| R-4 On-prem vs cloud export divergence | Single `IReportExporter` abstraction; **export-parity spike M0 (C-7)** |
| R-5 External credential security | Key Vault refs only (C-9); per-connector RBAC; no secrets in metadata/logs |
| R-6 Scope (300 reports) | MoSCoW V1/V2/V3; classify-then-migrate; MVP is CRM-only |
| R-7 Runaway queries | `qdb_rowlimit`/`qdb_timeoutseconds` guards; published-only execution; monitoring |
| R-8 Pixel-perfect letters | Functional parity V1; letters = specialised V3 track |
| R-9 Formula code-exec vector | **NCalc closed DSL only** (C-5); Jint/DynamicExpresso rejected |
| R-10 Data residency of cache | Residency-aware cache placement; `qdb_externalconnector.qdb_residencyregion` (C-2) |
| **New: N+1 provider calls on drilldown** | Batch child fetches; cap drill fan-out; cache per level |
| **New: designer/runtime schema drift** | Version snapshot is the contract; runtime never reads live child tables, only the published snapshot |

---

## 9. Best practices

**For report authors:** always add a date/status filter before running against large entities; use parameters instead of hardcoded values; test-run as draft before publishing; publish deliberately (each publish is an immutable version); prefer pre-aggregated sources for big aggregations; mark sensitive columns as masked.

**For the dev team:** extend via the engine seams (`IReportDataProvider`, `ITransformation`, `IReportExporter`) — never edit the core; every connector stores credentials in the vault and enforces timeouts + circuit breakers; keep the CRM plugin thin (no heavy work in-sandbox); the published snapshot is the runtime contract — never have the engine read live child config; unit-test each provider/transform/exporter in isolation (AAA), integration-test the sync + async paths, and run the export-parity suite on both targets before release.
