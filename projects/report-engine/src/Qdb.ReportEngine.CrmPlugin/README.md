# Qdb.ReportEngine.CrmPlugin — `qdb_RunReport` entry point

The thin CRM entry point for the Report Engine (arch §5, ADR-RPT-006). A stateless plugin that
relays a report run from a CRM caller (ribbon button / `Xrm.WebApi`) to the ASP.NET Core middle
tier, **as the signed-in user**, and returns the result. It deliberately does *nothing else* — no
definition parsing, no querying, no rendering — so it stays well within the 2-minute sandbox ceiling.

```
CRM caller ──(qdb_RunReport)──▶ RunReportPlugin ──HTTPS──▶ middle tier ──▶ Dataverse (as caller)
```

## What it does (and doesn't)

1. Reads the request (`reportId`, `parametersJson`, `format`, `async`).
2. Confirms an authenticated caller (the CRM session is authoritative).
3. Relays to the middle tier: `POST /api/reports/{id}/execute` for a run, or
   `/export?format=…` for a file (returned base64). The caller id goes in `X-Report-Caller-Id`,
   so the middle tier executes with that user's row-level security (impersonation).
4. Returns `resultJson` (+ `executionId`, `mode`, `errorCode`, `errorMessage`).

It does **not** write an execution-log record — the middle tier already writes
`qdb_reportexecutionlog` as the service identity, so the audit log has a single writer.

## Contract

| Request param | Type | Notes |
|---|---|---|
| `reportId` | String | required — the report definition GUID |
| `contextJson` | String | optional — `{entityName, recordId, selectedIds[], userId, buId}` |
| `parametersJson` | String | optional — runtime parameter values as JSON |
| `format` | String | `RUN` (default) \| `PDF` \| `XLSX` \| `DOCX` \| `CSV` \| `PNG` |
| `async` | Boolean | optional — currently degrades to sync (see limitations) |

| Response prop | Type | Notes |
|---|---|---|
| `executionId` | String | always returned |
| `mode` | String | `SYNC` (async not yet implemented) |
| `resultJson` | String | run: JSON rows; export: base64 file |
| `jobId` / `statusPollUrl` | String | reserved for the async path |
| `errorCode` / `errorMessage` | String | populated on a middle-tier failure or timeout |

## Configuration (Dataverse Environment Variables)

| Schema name | Purpose | Default |
|---|---|---|
| `qdb_rpt_middle_tier_url` | Base URL of the hosted middle tier | — (falls back to the plugin's unsecure config) |
| `qdb_rpt_sync_timeout_ms` | Synchronous HTTP timeout | `90000` (30s buffer under the 2-min ceiling) |

## Build

```bash
dotnet build src/Qdb.ReportEngine.CrmPlugin -c Release
```

Targets `net462` (the plugin sandbox runtime), builds cross-platform via the reference-assemblies
package. For **on-prem** registration the assembly must be strong-named: generate a key once
(`sn -k Qdb.ReportEngine.CrmPlugin.snk`) and set `SignAssembly=true` in the csproj. Dataverse cloud
accepts unsigned assemblies.

## Deploy & register

1. **Import the assembly** — `pac plugin push` (or the Plugin Registration Tool). Adds the
   `Qdb.ReportEngine.CrmPlugin.RunReportPlugin` plugin type.
2. **Register the Custom API + parameters** — `node scripts/register-customapi.mjs <path-to-.env>`
   (idempotent; creates them in the `qdb_reportengine` solution). Re-run after step 1 to **bind** the
   plugin type to the Custom API.
3. **Register the step** — `PostOperation`, **synchronous**, on the `qdb_RunReport` message.
4. **Set the environment variables** above (point `qdb_rpt_middle_tier_url` at the hosted middle tier).

## Calling it from a web resource / ribbon

```js
const req = {
  reportId: "…", parametersJson: JSON.stringify({ Branch: "Doha" }), format: "PDF",
  getMetadata: () => ({
    boundParameter: null, operationType: 0, operationName: "qdb_RunReport",
    parameterTypes: {
      reportId:       { typeName: "Edm.String", structuralProperty: 1 },
      parametersJson: { typeName: "Edm.String", structuralProperty: 1 },
      format:         { typeName: "Edm.String", structuralProperty: 1 }
    }
  })
};
const res = await Xrm.WebApi.online.execute(req).then(r => r.json());
```

## Known limitations / follow-ups

- **Async is not implemented** — an `async: true` request degrades to synchronous and sets
  `mode: SYNC`. The job-record orchestration + `qdb_GetJobStatus` API are a separate build
  (middle-tier P-items).
- **Auth (B1)** — the caller id is passed as a header; production should mint a validated bearer
  token here so the browser never holds it. Gated on the auth-scheme decision.
- **On-prem outbound HTTP** — the plugin's HTTPS call to the middle tier requires the sandbox
  outbound-URL allowlist to include the middle-tier host (arch pre-build risk).
- The middle tier must be **hosted and reachable** from the CRM server (cloud: internet/VNet; on-prem:
  internal network) — see the middle-tier hosting task.
