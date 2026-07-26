# EDP Decision Gateway

A **transport-only** REST façade over the Dataverse decision runtime (ADR-EDS-01/02). It lets
any HTTP client evaluate a rule without a Dataverse SDK — while the native C# runtime stays in
the sandbox. **The gateway never executes rules.** It authenticates callers, maps the canonical
envelope (ADR-EDS-04) onto the `qdb_edp_*` Custom API, and maps the result back.

> Node + TypeScript + Fastify, per the Maqsad backend-API default (see ADR-15, which records the
> deviation from the design doc's illustrative ASP.NET naming).

## Endpoints

| Method + path | Operation | Backing Custom API |
|---|---|---|
| `POST /v1/decisions/evaluate` | Evaluate a decision (durable — writes an execution log) | `qdb_edp_EvaluateDecision` |
| `POST /v1/decisions/test` | Test a decision (no durable write) | `qdb_edp_TestRule` |
| `POST /v1/decisions/explain` | Explain a past decision by execution-log id | `qdb_edp_ExplainDecision` |
| `POST /v1/rules/validate` | Validate a rule's structure | `qdb_edp_ValidateRule` |
| `POST /v1/rules/schema` | Get a rule's input/output schema | `qdb_edp_GetInputSchema` + `GetOutputSchema` |
| `POST /v1/rules/history` | Get a rule's version history | `qdb_edp_GetRuleHistory` |
| `POST /v1/rule-sets/evaluate` | Evaluate a governed rule set | `qdb_edp_ExecuteRuleSet` |
| `GET /openapi.json` · `GET /docs` | OpenAPI 3.1 spec + Swagger UI (no auth) | — |
| `GET /health` | Liveness (no auth) | — |

A rule is addressed by `versionId`, `id`, or `name` (the gateway resolves the latest published
version via `qdb_edp_GetPublishedVersion`). `history` needs `id` or `name`.

**Interactive docs:** run the gateway and open **`/docs`** (Swagger UI over `/openapi.json`).

```jsonc
// POST /v1/decisions/evaluate  — request (canonical envelope)
{
  "meta":    { "correlationId": "optional-caller-id" },
  "rule":    { "name": "Account Credit Tier" },   // or { "versionId": "<guid>" } / { "id": "<rule guid>" }
  "input":   { "revenue": 1500000 },
  "options": { "includeTrace": false }
}
```

```jsonc
// 200 response
{
  "meta":    { "correlationId": "...", "requestId": "...", "executionId": null, "elapsedMs": 14 },
  "matched": true,
  "outputs": { "creditTier": "Gold", "discount": 15 },
  "diagnostics": null
}
```

`/v1/decisions/test` returns the same shape (with `executionId: null`).
`/v1/rules/validate` → `{ meta, valid, diagnostics }`.
`/v1/rule-sets/evaluate` (body `{ ruleSetId, input }`) → `{ meta, result }`, where `result` is the
set's native aggregate (policy, matched count, per-member results).

Errors return `{ meta, error: { code, message, details? } }` with `invalid_request` (400),
`unauthorized` (401), `rule_not_found` (404), or `runtime_error` (502).

## Auth

Callers present `x-api-key`. Configure keys via `EDP_GATEWAY_API_KEYS` (comma-separated). The
gateway holds its own **service-principal** credentials to call Dataverse — caller keys never
reach Dataverse. An empty key set disables auth (dev only; logged as a warning).

## Rate limiting

Each caller gets `EDP_RATE_LIMIT_MAX` requests per `EDP_RATE_LIMIT_WINDOW_SECONDS` (default
**120 per 60s**). Set `EDP_RATE_LIMIT_MAX=0` to disable. Exceeding it returns **429** in the
canonical error envelope with code `rate_limited`, alongside standard `x-ratelimit-*` headers.

Two properties worth knowing:

- **`/health` is never throttled.** A liveness probe must not fail because a caller is noisy.
- **The bucket key is the API key only when that key is valid**; every other request falls back
  to a per-address bucket. Keying on the presented key alone would let a caller mint unlimited
  quota by rotating invented keys. Authentication runs as a `preHandler` specifically so the
  limiter — whose hook is route-level, and therefore runs after instance-level `onRequest`
  hooks — counts unauthenticated attempts instead of being short-circuited by a 401.

> **Single-instance only.** Counters are held in memory, so each replica enforces its own quota.
> Running more than one replica behind a load balancer requires a shared store (Redis) — the
> plugin supports one; wiring it is deliberately deferred until a deployment topology is chosen.
> Requests to paths with no matching route are not counted (route-level hooks never run).

## Configuration (env)

| Variable | Purpose |
|---|---|
| `PORT` | Listen port (default 8787) |
| `EDP_GATEWAY_API_KEYS` | Comma-separated caller API keys |
| `EDP_RATE_LIMIT_MAX` | Requests per caller per window (default 120; `0` disables) |
| `EDP_RATE_LIMIT_WINDOW_SECONDS` | Window length in seconds (default 60) |
| `DATAVERSE_URL` | e.g. `https://org5869857f.crm4.dynamics.com` |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | Gateway's service principal |

## Run

```bash
npm install
npm run dev      # tsx watch
npm test         # vitest (transport mapping proven against a fake runtime)
npm run build && npm start
```

### Container

```bash
docker build -t edp-gateway:local projects/enterprise-decision-platform/gateway
docker run --rm -p 8787:8787 --env-file gateway.env edp-gateway:local
```

Multi-stage (build → prod-deps → runtime) on `node:20-alpine`, running as the unprivileged
`node` user, with a `HEALTHCHECK` against `/health`. **No configuration is baked into the
image** — pass credentials and caller keys at run time via `--env-file` or your orchestrator's
secret mechanism, never via `--build-arg` (build args persist in image history).

## Boundaries (do not cross)

- No decision logic here — evaluation is delegated to the runtime via `DecisionRuntime`.
- Transport, validation, auth, and envelope mapping only.
- The zero-infra **core** invariant (ADR-05) is intact: this gateway is the accepted **optional**
  tier; the runtime and rules remain inside Dataverse.

## MVP scope / follow-ups

Implemented: **evaluate, test, validate, evaluate-rule-set** (all live-smoke-verified against the
org) plus the reads **schema, history, explain**, a served **OpenAPI 3.1 spec + Swagger UI**,
**per-caller rate limiting**, and a **container image**.
Not yet: a shared rate-limit store for multi-replica deployment, and a Power Platform SDK.

**Field-mapping status:** every operation has now been live-smoke-verified against
`org5869857f` — evaluate / test / validate (2026-07-22) and the three reads **schema, history,
explain** (2026-07-26). The reads pass the Custom API's `ResultJson` straight through and the
live payloads matched.

**Known gap — `executionId` is null until assembly 1.0.24 ships.** `/v1/decisions/explain` is
addressed by an execution-log id, and `evaluate` is what hands that id back. The plugin change
that returns it (`ExecutionId` on `qdb_edp_EvaluateDecision`) is merged but **not deployed** —
it rides the W0-1 strong-name-key cutover along with the pin guard, because the assembly cannot
be re-signed until the new key is vaulted (see `../wave-0-snk-rotation-scope.md`). Until then a
caller must source the log id another way (e.g. an ops view over `qdb_edp_ruleexecutionlog`).
`deploy/verify-execution-id.js` proves the chain end-to-end and is expected to fail until cutover.
