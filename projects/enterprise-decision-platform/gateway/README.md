# EDP Decision Gateway

A **transport-only** REST façade over the Dataverse decision runtime (ADR-EDS-01/02). It lets
any HTTP client evaluate a rule without a Dataverse SDK — while the native C# runtime stays in
the sandbox. **The gateway never executes rules.** It authenticates callers, maps the canonical
envelope (ADR-EDS-04) onto the `qdb_edp_*` Custom API, and maps the result back.

> Node + TypeScript + Fastify, per the Maqsad backend-API default (see ADR-15, which records the
> deviation from the design doc's illustrative ASP.NET naming).

## Endpoint

`POST /v1/decisions:evaluate` — evaluate a decision.

```jsonc
// request (canonical envelope)
{
  "meta":   { "correlationId": "optional-caller-id" },
  "rule":   { "name": "Account Credit Tier" },       // or { "versionId": "<guid>" } or { "id": "<rule guid>" }
  "input":  { "revenue": 1500000 },
  "options": { "includeTrace": false }
}
```

```jsonc
// 200 response
{
  "meta":   { "correlationId": "...", "requestId": "...", "executionId": null, "elapsedMs": 14 },
  "matched": true,
  "outputs": { "creditTier": "Gold", "discount": 15 },
  "diagnostics": null
}
```

Errors return `{ meta, error: { code, message, details? } }` with `invalid_request` (400),
`unauthorized` (401), `rule_not_found` (404), or `runtime_error` (502).

`GET /health` → `{ "status": "ok" }` (no auth).

## Auth

Callers present `x-api-key`. Configure keys via `EDP_GATEWAY_API_KEYS` (comma-separated). The
gateway holds its own **service-principal** credentials to call Dataverse — caller keys never
reach Dataverse. An empty key set disables auth (dev only; logged as a warning).

## Configuration (env)

| Variable | Purpose |
|---|---|
| `PORT` | Listen port (default 8787) |
| `EDP_GATEWAY_API_KEYS` | Comma-separated caller API keys |
| `DATAVERSE_URL` | e.g. `https://org5869857f.crm4.dynamics.com` |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | Gateway's service principal |

## Run

```bash
npm install
npm run dev      # tsx watch
npm test         # vitest (transport mapping proven against a fake runtime)
npm run build && npm start
```

## Boundaries (do not cross)

- No decision logic here — evaluation is delegated to the runtime via `DecisionRuntime`.
- Transport, validation, auth, and envelope mapping only.
- The zero-infra **core** invariant (ADR-05) is intact: this gateway is the accepted **optional**
  tier; the runtime and rules remain inside Dataverse.

## MVP scope / follow-ups

Evaluate is implemented end-to-end. Not yet: the remaining EDS operations (validate, test,
execute-rule-set, the `Get*` reads), rate limiting, OpenAPI doc, and containerisation. The
`DataverseRuntime` field mapping (`GetPublishedVersion` result, `EvaluateDecision` outputs)
should be smoke-checked against the live API before production use.
