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
| `qdb_rpt_service_token` | Middle-tier service token — **cloud only** | — (on-prem uses secure configuration) |

### Where the service token lives, and why it differs per target

The middle tier requires `Authorization: ServiceToken <secret>` (ADR-RPT-010). That secret
authorises naming the acting user, so it belongs somewhere users cannot read.

- **On-premise** — the plugin step's **secure configuration**. Withheld from everyone but a
  registration administrator. This is the preferred store and the plugin checks it first.
- **Cloud** — an environment variable, because a Custom API is implemented by a *platform-managed*
  step pinned to the MainOperation stage. Dataverse rejects any attempt to modify it
  (`0x80044184 — Steps can only be modified in stages Before/AfterMainOperation…`), so that step has
  no secure configuration to write to.

> **TODO(RPT-B1-CLOUD)** — the cloud fallback is an interim. An environment variable is an ordinary
> row: any user who can read it can call the middle tier as anyone, which is the B1 hole via another
> door. Replace it with a **Dataverse plugin managed identity** minting an Entra token for the
> middle tier's audience — no secret in CRM at all, and it lands on the `EntraJwt` scheme the middle
> tier already accepts.

## Build

```bash
dotnet build src/Qdb.ReportEngine.CrmPlugin -c Release
```

Targets `net462` (the plugin sandbox runtime), builds cross-platform via the reference-assemblies
package. The assembly is **strong-named** (`SignAssembly=true`) because on-prem registration
requires it, and signing both targets keeps one assembly identity everywhere.

Generate the key once: `sn -k Qdb.ReportEngine.CrmPlugin.snk`. It is **gitignored** — the public key
token forms part of the identity Dataverse registers, so building with a different key yields an
assembly the platform treats as separate and the existing registration can no longer be updated in
place. **Escrow the key in the team secret store.** The test project is signed with the same key,
since a strong-named assembly only grants `InternalsVisibleTo` to a friend bearing the matching
public key.

## Deploy & register

```bash
node scripts/import-plugin-assembly.mjs <path-to-.env>                      # 1
node scripts/register-customapi.mjs    <path-to-.env>                      # 2
node scripts/configure-plugin.mjs      <path-to-.env> <url> <service-token> # 3
node scripts/invoke-runreport.mjs      <path-to-.env>                       # 4 — smoke test
```

1. **Import the assembly + plugin type** (idempotent — updates content in place rather than creating
   a duplicate, which would orphan the Custom API binding).
2. **Register the Custom API + parameters**, and **bind** the plugin type to it. No manual step
   registration is needed: binding `PluginTypeId` makes the platform create the implementation step.
3. **Configure** the middle-tier URL and service token.
4. **Smoke-test** through the platform. Until the middle tier is hosted this returns
   `errorCode: middle_tier_unreachable`, which still confirms the assembly loaded, the Custom API
   bound, the configuration resolved, and the sandbox permitted the outbound call.

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
