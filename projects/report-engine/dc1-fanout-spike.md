# DC-1 Fan-Out Architecture Spike — Result
# V2-Dashboard (M2.5) Pre-Build Gate · RPT-ENG-001

| | |
|---|---|
| **Gate** | DC-1 (CEO Checkpoint, 2026-07-19) |
| **Spike duration** | 1 person-day (within 2-day authorised limit) |
| **Author** | Architect (Maqsad AI) |
| **Date** | 2026-07-19 |
| **Status** | RESULT — DC-1: CLEARED (design); load-test proof required in Phase 4 |
| **ADR to scaffold** | ADR-RPT-008 — Dashboard fan-out concurrency control and OBO query execution model |

---

## VERDICT (stated up front)

**DC-1: CLEARED (design)**

The fan-out model — with the eight-layer mitigation stack described in §4 — credibly avoids Dataverse service-protection throttle (cloud) and on-prem app-tier saturation at the stated peak concurrency assumption of 20 simultaneous 12-widget dashboard opens. Without mitigations, the naive model would certainly throttle on cloud (240 concurrent requests vs the 52-request-per-user limit) and would likely saturate on-prem (240 simultaneous SDK connections). With the full mitigation stack in place, effective concurrent requests per user identity drop to 6 — well within documented limits on both targets.

Three Phase-4 proof obligations remain (DC-1a, DC-1b, DC-1c). Two QDB assumptions must be confirmed before production cache is enabled. ADR-RPT-008 must be approved before `DashboardExecutionService` implementation begins.

---

## 1. Objective and Exit Criteria

### 1.1 Objective

Validate that a 12-widget Customer-360 dashboard can execute its per-widget data fetches within a defined SLA at expected peak user concurrency, on both Dataverse cloud and Dynamics CRM on-premise 9.x targets, without triggering:
- Dataverse service-protection API limits (HTTP 429 / Retry-After) on cloud
- App-tier thread pool or SQL Server connection pool saturation on on-prem 9.x

This spike is a design-and-analysis spike. It produces written pass/fail criteria and expected numbers. Load test execution happens during Phase-4 build as proof obligation DC-1a.

### 1.2 Proposed SLAs

> **ASSUMPTION-1**: Peak concurrency = 20 simultaneous dashboard opens. Based on estimated QDB branch CRM session size of 50–150 concurrent users, of whom ≤ 15% are expected to open a Customer-360 dashboard simultaneously at peak. **QDB must confirm this figure.** If the actual peak is higher (e.g., 50 users), the global semaphore and per-dashboard cap values in §4 must be re-tuned and the load test re-run.

**Per-widget data-fetch latency** (middle-tier boundary: query dispatch → raw result returned to `DashboardExecutionService`):

| Percentile | Target | Basis |
|---|---|---|
| P50 | ≤ 1.5 s | Typical CRM FetchXML aggregate on well-indexed entity |
| P95 | ≤ 4.0 s | P95 gate for go/no-go in §5 load test |
| P99 | ≤ 8.0 s | Acceptable tail; retry budget still available |
| Hard max | 15 s | Widget transitions to error state; circuit-breaker event logged |

**Dashboard-load SLA** (end-to-end, runtime viewer, 12 widgets):

| Condition | Target |
|---|---|
| Time to first widget visible (progressive rendering) | ≤ 2 s |
| All 12 widgets visible, P95, at 20 concurrent users — cold cache | ≤ 15 s |
| All 12 widgets visible, P95, at 20 concurrent users — warm cache | ≤ 3 s |

**Throttle avoidance**:
- Zero Dataverse 429 responses in scenarios 1–4 (§5.3)
- Zero connection refused / timeout from on-prem app-tier in scenarios 1–4

### 1.3 Pass/Fail Criteria (all required to clear DC-1 at Phase-4 load test)

1. Per-widget P95 latency ≤ 4.0 s at 20 concurrent dashboard opens, cold cache
2. Dashboard-load P95 ≤ 15 s at 20 concurrent dashboard opens, cold cache
3. Zero Dataverse 429 responses in scenarios 1–4
4. Zero on-prem connection refused / timeout in scenarios 1–4
5. No single user's concurrent Dataverse request count exceeds 40 (safety margin below the 52-request-per-user limit)
6. Scenario 5 (throttle resilience test) recovers within 2 retry cycles per widget

---

## 2. Fan-Out Model Analysis

### 2.1 Widget-to-Entity Composition (Customer-360 Reference Dashboard)

The reference dashboard — the primary V2-Dashboard use case and the worst-case fan-out scenario:

| Widget # | Type | Entity | Operation |
|---|---|---|---|
| 1 | Profile | account | Single record retrieval |
| 2 | Metric | qdb_loanapplication | COUNT(active applications) |
| 3 | Metric | qdb_loanapplication | SUM(qdb_requestedamount) |
| 4 | Status Badge | qdb_loanapplication | MAX(statuscode) latest |
| 5 | Gauge | qdb_facility | SUM(drawn) ÷ SUM(limit) |
| 6 | Table | qdb_facility | Raw rows, date-filtered |
| 7 | Chart (Donut) | qdb_loanapplication | COUNT grouped by branch |
| 8 | Metric | qdb_collateral | SUM(qdb_collateralvalue) |
| 9 | Chart (Bar) | qdb_collateral | COUNT grouped by type |
| 10 | Status Badge | qdb_sla | Record lookup |
| 11 | Checklist | contact | COUNT grouped by role |
| 12 | Info Cards | qdb_workflow | Latest 5 rows by date |

Distinct entities: 7 (`account`, `qdb_loanapplication`, `qdb_facility`, `qdb_collateral`, `qdb_sla`, `contact`, `qdb_workflow`)

Co-located widgets sharing the same entity: `qdb_loanapplication` (widgets 2, 3, 4, 7) and `qdb_collateral` (widgets 8, 9). After ExecuteMultiple batching (§4.4), these reduce to 5 batched requests + 2 individual requests = **7 actual Dataverse calls** (not 12). A 42% reduction from naive fan-out.

### 2.2 Load Calculation — Dataverse Cloud

The critical risk on cloud is the **52 concurrent request limit per user identity** (§3.1). The outcome depends entirely on whether requests run under the user's identity (OBO) or a shared service principal.

| Approach | Concurrent requests to Dataverse | vs 52-limit (shared SP) | vs 52-limit (OBO per user) |
|---|---|---|---|
| Naive — 20 users × 12 widgets, no mitigation | 240 | EXCEEDS by 4.6× — CERTAIN THROTTLE | 12/user — safe |
| Per-dashboard cap 6, 20 users, no OBO | 120 | EXCEEDS by 2.3× — CERTAIN THROTTLE | 6/user — safe |
| Cap 6 + OBO + global semaphore 40 | ≤ 40 (distributed) | safe | ≤ 2/user average — safe |
| After batching (7 requests not 12) | ≤ 40 (distributed) | safe | safe |

**Conclusion for cloud**: OBO tokens + global semaphore is the minimum required combination. Neither alone is sufficient.

### 2.3 Load Calculation — On-Prem 9.x

On-prem has no Retry-After signal. Failure is hardware-level: thread pool exhaustion, SQL connection pool exhaustion, or IIS request queue overflow.

| Approach | App-tier threads demanded | SQL connections | Verdict |
|---|---|---|---|
| Naive — 20 × 12, no mitigation | 240 | 240 | SATURATION LIKELY |
| Per-dashboard cap 4, 20 users, no global semaphore | 80 | 80 | RISK (hardware-dependent) |
| Global semaphore 30 + per-dashboard cap 4 | ≤ 30 | ≤ 30 | SAFE (within default pool limits) |

On-prem global semaphore is set more conservatively (30) than cloud (40) due to the absence of a graceful Retry-After recovery signal.

---

## 3. Platform Limits

### 3.1 Dataverse Cloud — Service-Protection API Limits

Three categories, each a rolling 5-minute window applied **per user identity**:

| Category | Published limit | Per-user headroom at 6-cap | Status |
|---|---|---|---|
| Number of API requests | 6,000 per 5-minute window | ~72 per 5 min (12 opens × 6 widgets) | 1.2% of limit — safe |
| Aggregate execution time | 1,200 s per 5-minute window | ~72 s estimated (6 req × 12 s avg) | 6% — safe |
| Concurrent requests | 52 simultaneous | 6 per user (per-dashboard cap) | 11.5% — safe |

**Throttle behavior on limit breach**: HTTP 429 response with `Retry-After` header (integer seconds to wait). Body error code: `0x80060467`. The 429 response is per-request; other in-flight requests from the same user are NOT cancelled.

**Application user / service principal limits**: The same three-category limits apply to service principals. If the middle tier routes all queries through one service principal identity (no OBO), all users' requests pool against that single identity's 52-concurrent limit. At 20 users × 6-cap = 120 concurrent, this exceeds the limit 2.3×. OBO is the mandatory control (see §4.1).

**Version dependency**: the 6,000-request and 52-concurrent limits are documented for Dataverse standard tier as of 2025. Microsoft may apply higher limits for premium environments or reduce them for heavily throttled regions. The spike numbers are based on documented standard limits; QDB's actual environment limits must be confirmed in the Dataverse admin center before load testing.

### 3.2 Dynamics CRM On-Prem 9.x — Throughput Constraints

No cloud-style documented API limits with Retry-After. Constraints are infrastructure-level and hardware-dependent:

| Constraint | Typical range | Notes |
|---|---|---|
| IIS app pool thread pool | 50–200 threads | Default IIS: `processorCount × 250` in managed thread pool; configurable |
| CrmServiceClient connection pool | 10–50 concurrent connections | Configurable in the `ServiceClient` constructor via `MaxConnectionsPerServer` |
| SQL Server connection pool | 100 connections (ADO.NET default) | Shared across ALL CRM operations on the server, not just report engine |
| OrgService throughput | ~100–300 req/s on typical hardware | No published limit; empirically measured |
| Plugin sandbox timeout | 2 minutes | NOT APPLICABLE — middle-tier SDK calls bypass the plugin sandbox entirely |

The 2-minute plugin ceiling (Constitution Article X) applies only to the CRM entry point plugin, which is a thin proxy. The middle tier executes outside the sandbox; its calls to Dataverse are standard SDK HTTP calls with no sandbox ceiling.

**Failure modes on saturation** (no Retry-After equivalent):
- `System.ServiceModel.FaultException<OrganizationServiceFault>`: query-level CRM error
- `TimeoutException`: connection or query timeout
- `SqlException`: SQL Server connection pool exhausted
- HTTP 503 from IIS: request queue full (IIS `requestQueueLimit` exceeded)

Recovery requires exponential backoff with circuit breaker (§4.7). The circuit breaker is more important on-prem than on cloud because there is no admission-control signal to guide retry timing.

---

## 4. Mitigation Architecture

The recommended stack has eight layers. All layers are required; no single layer is sufficient. They are ordered from highest to lowest impact on Dataverse pressure.

### 4.1 Mitigation 1 — OBO Token Execution (Cloud; highest impact)

**What**: The `DashboardExecutionService` uses the requesting user's delegated token — acquired via MSAL OBO flow from the bearer token passed in by the CRM entry point — for all Dataverse SDK calls within that dashboard execution. The service principal orchestrates but never queries.

**Why**: Distributes request counts and concurrent-request quotas across individual user identities. Each user's 6 concurrent widget fetches consume 11.5% of their 52-concurrent limit, independent of all other users. The service principal's quota is no longer the bottleneck.

**Implementation sketch (cloud)**:
```csharp
// DashboardController receives userBearerToken from the CRM entry point
var oboToken = await _msalOboProvider.AcquireOnBehalfOfAsync(userBearerToken, DataverseScope);
var dataverseClient = _clientFactory.CreateForUserToken(oboToken);
// All IReportDataProvider calls within this execution receive this client
```

MSAL token acquisition latency: ~50 ms for a new token. Subsequent calls within the 1-hour token lifetime use the in-memory token cache — effectively zero overhead.

**On-prem equivalent**: The `OrganizationServiceProxy` used by the Org Service SDK executes under the impersonated CRM user when the CRM entry point passes `CallerObjectId` in the plugin execution context. No MSAL OBO flow is needed. The SDK's `IOrganizationServiceFactory.CreateOrganizationService(userId)` handles user context. This difference is one of the decisions ADR-RPT-008 must document.

### 4.2 Mitigation 2 — Global Process-Level Concurrency Semaphore

**What**: A process-singleton `SemaphoreSlim` in the `DashboardExecutionService` limits the total number of concurrently active Dataverse connections at any given moment across ALL dashboard executions in the process.

**Configuration** (Constitution Article V — no hardcoding):
```
DashboardEngine:MaxGlobalConcurrency = 40    # cloud default
DashboardEngine:MaxGlobalConcurrency = 30    # on-prem default
```

**Why**: Without this, twenty simultaneous dashboard opens each holding their per-dashboard cap slots concurrently = 20 × 6 = 120 simultaneous connection attempts, bypassing the per-dashboard limit. The global semaphore is the process-level backstop.

**Latency impact at 20 concurrent opens**: requests queue behind the semaphore. Estimated additional latency per queued widget: 1–2 seconds (queue depth ≤ 80 requests / ~40 concurrent throughput ≈ 2 s clearance time). This is within the P99 budget.

### 4.3 Mitigation 3 — Per-Dashboard Parallelism Cap

**What**: The inner `SemaphoreSlim` within a single dashboard execution. Maximum `DashboardEngine:PerDashboardParallelism` concurrent widget fetches (default: 6, per ADD-A-7; 4 for on-prem).

**Why**: Without this inner gate, a single dashboard execution could consume all global semaphore slots, starving other concurrent executions.

**Semaphore nesting**: a widget must acquire the inner semaphore (cap 6) AND the global semaphore (cap 40) before dispatching its fetch. If the global is exhausted, the inner-semaphore holder waits (bounded by the per-widget hard max of 15 s before returning an error state).

### 4.4 Mitigation 4 — ExecuteMultiple / OData $batch for Same-Entity Widgets

**What**: Before dispatching, `DashboardExecutionService` groups widget queries by `qdb_entitylogicalname`. Widgets targeting the same entity are bundled into a single request:
- **On-prem (Org Service SDK)**: `ExecuteMultipleRequest` with individual `RetrieveMultipleRequest` children
- **Cloud (Dataverse Web API)**: OData `$batch` multipart request

**Impact**: reduces actual Dataverse requests from 12 (naive) to 7 for the reference Customer-360 dashboard (a 42% reduction). For Dataverse cloud, `ExecuteMultiple` counts as a **single API request** toward the 6,000-per-5-minute limit regardless of batch size.

**Required configuration**: `ExecuteMultipleRequest` must use `ContinueOnError = true` — this prevents one slow widget query within the batch from aborting the entire batch and blocking unrelated widgets.

**Scope constraint**: only same-entity widgets with independently executable queries can be batched. Widgets with cross-entity joins, custom API data sources, or external connectors remain as individual requests.

### 4.5 Mitigation 5 — Per-Widget Result Cache with Security-Context Keying

**Cache key** (from ADD-FR-036, extending ADR-RPT-007):
```
cacheKey = SHA-256(widgetId + sortedParamJson + roleSetHash)
```

Where `roleSetHash` = SHA-256(sorted list of the running user's CRM security role GUIDs).

**Security correctness**: `roleSetHash` ensures users with different CRM security role sets never share a cache entry. CRM's own query-time security filters restrict which rows each role sees; the cache key preserves that boundary.

**Record-level ownership caveat**: If any Customer-360 entity uses record-level ownership (i.e., the same role can own different records for different users — user-owned entities), `roleSetHash` is insufficient as a cache key for those widgets. Two users with identical role sets but different record ownership would receive each other's data. For ownership-sensitive widgets, the cache key must be extended to include `userId`.

> **ASSUMPTION-2**: The Customer-360 entities — `account`, `qdb_loanapplication`, `qdb_facility` — are BU-level or organisation-level owned, not user-level owned. **QDB must confirm this** before production cache is enabled for the Customer-360 dashboard (see DC-1b). If any entity is user-owned, the per-widget cache key must include `userId` for that widget.

**Pre-warm on publish**: `DashboardPublishHandler` enqueues a background pre-warm job via `IJobOrchestrator` when a dashboard is published. The job runs each widget query under the Report Admin identity and populates the cache. Cold-start burst from the publish event is absorbed by the pre-warm job, not by the first 20 users to open the dashboard.

**Cache store**: `ICacheStore` interface (unchanged from ADR-RPT-007). Cloud: Redis. On-prem: SQL Server cache table (`qdb_reportcache`). No changes to the existing cache abstraction.

**TTL**: per-widget via `qdb_dashboardwidget.qdb_cachettlseconds` (default 900 s). Admin-configurable down to 0 (no cache) for near-real-time widgets; all per-widget TTLs are stored in Dataverse, not hardcoded (Constitution Article V).

### 4.6 Mitigation 6 — Progressive Widget Streaming (UX, not Dataverse pressure)

**What**: `DashboardExecutionService` returns results as `IAsyncEnumerable<WidgetResult>`. The API streams each widget result as it arrives (chunked HTTP or Server-Sent Events). The runtime viewer renders each widget immediately on receipt without waiting for the full set.

**Impact**: first widget visible < 2 s (the fastest widget — typically the cached Account Profile — resolves immediately). The user sees progressive population rather than a blank screen for 12 seconds.

**Dataverse impact**: none. Parallelism is unchanged; this is purely a rendering concern.

### 4.7 Mitigation 7 — Retry with Retry-After Honoring and Circuit Breaker

**Cloud (HTTP 429)**:
```csharp
for (var attempt = 1; attempt <= 3; attempt++)
{
    var response = await dataverseClient.FetchAsync(query, ct);
    if (response.StatusCode != HttpStatusCode.TooManyRequests) break;
    var retryAfter = response.Headers.RetryAfter?.Delta ?? TimeSpan.FromSeconds(5);
    await Task.Delay(retryAfter + Jitter(), ct);
}
// after 3 attempts: return WidgetResult.Error("DATA_UNAVAILABLE")
```

**On-prem (exceptions)**:
- Exponential backoff: 2 s, 4 s, 8 s + ±1 s jitter per retry
- Max 3 retries per widget
- After 3 retries: `WidgetResult.Error` (non-blocking — other widgets continue)

**Circuit breaker** (per entity, applied at `DashboardExecutionService`):
- Open: after 5 consecutive failures on the same `entityLogicalName` within a 60-second window
- Half-open: probe with one request after 30 seconds
- Closed: on successful probe

When the circuit breaker is open for an entity, widgets targeting that entity immediately return `WidgetResult.Error` without issuing a Dataverse call. This prevents retry cascades from compounding under a genuinely failing entity.

### 4.8 Mitigation 8 — In-Flight Request Deduplication (Query Coalescing)

**What**: Before dispatching, `DashboardExecutionService` checks a `ConcurrentDictionary<string, Task<WidgetResult>>` indexed by widget cache key. If another concurrent execution is already fetching the same key, the second caller awaits the first result rather than issuing a duplicate Dataverse call.

**Why**: During a cold-start burst (20 users opening the same dashboard simultaneously), it is common for multiple users to request the same widget with the same parameters and the same role set. Without coalescing, this is 20 duplicate Dataverse calls for the same data.

**Interaction with cache**: once the first fetch completes, the result is written to the `ICacheStore`. Subsequent callers after the `Task<WidgetResult>` completes will find the cache entry directly; the deduplication dictionary is cleared on completion.

### 4.9 Target-Specific Strategy Summary

| Mitigation | Dataverse Cloud | On-Prem CRM 9.x |
|---|---|---|
| Per-user identity execution | MSAL OBO flow (required) | Org Service user impersonation via CallerObjectId |
| Global concurrency semaphore | SemaphoreSlim(40) | SemaphoreSlim(30) |
| Per-dashboard parallelism cap | 6 concurrent widget fetches | 4 concurrent widget fetches |
| Same-entity query batching | OData $batch | ExecuteMultipleRequest (ContinueOnError = true) |
| Widget result cache backend | Redis via ICacheStore | SQL Server cache table via ICacheStore |
| Cache pre-warm on publish | IJobOrchestrator background job | IJobOrchestrator background job |
| Throttle recovery | Retry-After header honoring | Exponential backoff + jitter |
| Query coalescing | ConcurrentDictionary coalescing | ConcurrentDictionary coalescing |
| Circuit breaker | Per entity, 5 failures / 60 s | Per entity, 5 failures / 60 s |

All mitigations are implemented exclusively in `DashboardExecutionService` (a new middle-tier service). No changes are required to `ICacheStore`, `IJobOrchestrator`, `IReportDataProvider`, or any existing V1 component. The mitigation stack depends on, but does not modify, all existing engine abstractions.

---

## 5. How to Measure — Load Test Plan

### 5.1 Test Fixture

The **12-widget Customer-360 dashboard** (§2.1). This is the worst-case fan-out scenario: maximum widget count, maximum entity diversity, maximum expected concurrency. A simpler dashboard does not stress the system; the test fixture must be the reference dashboard.

### 5.2 Tooling

| Tool | Purpose |
|---|---|
| k6 (Grafana Labs, OSS, MIT license) | HTTP load test runner; scripted scenarios; built-in P95/P99 assertions |
| dotnet-counters | Process-level metrics: thread count, GC pressure, semaphore queue depth |
| Serilog structured logs | Per-widget latency distribution via existing observability (Constitution Article XIV) |
| Dataverse analytics (cloud) | Power Platform admin centre: service-protection events and error counts |
| SQL Server Extended Events (on-prem) | Connection pool usage, query duration, blocking |

### 5.3 Test Scenarios

**Scenario 1 — Single user, cold cache (baseline)**
- 1 virtual user, cache purged
- Opens the 12-widget dashboard 3 times in succession
- Pass: per-widget P95 ≤ 4 s; dashboard total P95 ≤ 15 s; zero Dataverse errors

**Scenario 2 — Single user, warm cache**
- 1 virtual user; cache pre-populated by scenario 1
- Opens the dashboard 3 times
- Pass: per-widget P95 ≤ 0.5 s; dashboard total ≤ 2 s

**Scenario 3 — Peak concurrency, cold cache (the gate scenario)**
- 20 virtual users ramp from 0 → 20 over 10 seconds
- All open the 12-widget Customer-360 dashboard simultaneously
- Cache cold (purged between runs)
- Pass: per-widget P95 ≤ 4 s; dashboard P95 ≤ 15 s; ZERO Dataverse 429s (cloud); ZERO connection errors (on-prem)

**Scenario 4 — Sustained load, mixed cache**
- 20 virtual users; each repeats the dashboard open every 90 seconds for 15 minutes
- Simulates realistic production: some TTL-expired widgets, some cached
- Pass: no throughput degradation beyond scenario 3 baseline after 5 minutes (cache stabilisation); zero throttle events throughout

**Scenario 5 — Throttle resilience (expected to produce 429s)**
- Mitigations intentionally disabled: global semaphore removed, per-dashboard cap set to 12
- 20 virtual users, simultaneous, cold cache
- Expected: Dataverse 429s triggered; on-prem connection pressure generated
- Pass: retry strategy recovers within 2 retry cycles per widget; circuit breaker engages correctly; no permanent widget failures

### 5.4 Expected vs Worst-Case Numbers

| Scenario | P95 per-widget | Dashboard P95 | Dataverse 429s | Notes |
|---|---|---|---|---|
| 1 — cold, 1 user | 1.5 s | 6 s | 0 | Sequential from cap |
| 2 — warm, 1 user | 0.3 s | 1.0 s | 0 | Cache read only |
| 3 — cold, 20 users, mitigations on | 3.5 s | 12 s | 0 | Semaphore queuing adds ~2 s |
| 3 worst-case (on-prem under-provisioned) | 7 s | 20 s | N/A | Triggers DC-1 FAIL — demands load test on actual hardware |
| 4 — sustained, mixed cache | 2.0 s | 7 s | 0 | Cache warms over first 5 min |
| 5 — mitigations off | 3.5 s | 12 s | ~60 in burst | Retry recovers; proves the safety net |

### 5.5 Go/No-Go Thresholds

| Metric | PASS | FAIL |
|---|---|---|
| Per-widget P95 latency — scenarios 1–4 | ≤ 4.0 s | > 4.0 s |
| Dashboard P95 latency — scenarios 1–4 | ≤ 15 s | > 15 s |
| Dataverse 429 count — scenarios 1–4 | 0 | ≥ 1 |
| On-prem connection errors — scenarios 1–4 | 0 | ≥ 1 |
| Scenario 5 recovery cycles per widget | ≤ 2 | > 3 |
| Circuit breaker false positives | 0 | ≥ 1 |

---

## 6. Risks, Residual Concerns, and Dependencies

| ID | Risk | Impact | Target | Mitigation / Owner |
|---|---|---|---|---|
| RC-1 | OBO MSAL flow on on-prem hybrid setup | High | Cloud only | On-prem uses Org Service impersonation — different mechanism; confirm working in M1 integration (DC-1c) |
| RC-2 | Record-level ownership in Customer-360 entities [ASSUMPTION-2] | High | Both | QDB must confirm BU-level vs user-level ownership for account, qdb_loanapplication, qdb_facility before production cache enabled (DC-1b) |
| RC-3 | ExecuteMultiple batch timeout — slow widget query delays batch completion | Medium | On-prem | `ContinueOnError = true`; per-query timeout enforced within the batch; validated in scenario 1 |
| RC-4 | Sync/async boundary for heavy dashboards not yet defined | Medium | Both | Define threshold in M2.5 Phase-3 addendum; dashboards with external-source widgets (V3) use IJobOrchestrator async path |
| RC-5 | C-2 (PDPPL data-residency) production gate — open | High | Both | Non-waivable; resolved by DC-2, not DC-1; Customer-360 production deployment blocked until C-2 cleared regardless of this spike outcome |
| RC-6 | Cross-filter burst invalidates warm cache (different paramJson) | Low–Medium | Both | Burst handled within existing semaphore caps; cache warms for each cross-filter combination after first click |
| RC-7 | On-prem hardware provisioning unknown — load test must run on actual infrastructure | High | On-prem | Scenario 3 MUST be run against actual QDB on-prem staging environment; cloud proxy is not sufficient for on-prem validation |
| RC-8 | Pre-warm job contention with V1 background worker | Low | Both | IJobOrchestrator supports concurrent job execution; pre-warm jobs run at LOW priority; V1 report jobs run at NORMAL |
| RC-9 | Widget TTL of 0 (admin-configured) bypasses cache and returns full Dataverse pressure | Low | Both | No cache = full fan-out cost per request; restrict TTL=0 to power-user admin action with explicit performance warning in the composer UI |

---

## 7. VERDICT

### DC-1: CLEARED (design)

The fan-out model, with the eight-layer mitigation stack in §4, credibly meets the defined per-widget SLA (P95 ≤ 4 s) and dashboard-load SLA (P95 ≤ 15 s) at the stated peak concurrency assumption (20 simultaneous 12-widget dashboard opens) on both Dataverse cloud and Dynamics CRM on-prem 9.x.

**On cloud**: OBO tokens + global semaphore (40) + per-dashboard cap (6) + ExecuteMultiple batching reduces effective concurrent Dataverse requests per user to 6 (11.5% of the 52-request limit). The 6,000-requests-per-5-minute and 1,200-s-execution-time limits are trivially safe at 1.2% and 6% respectively. Zero 429s are expected under this model.

**On on-prem**: global semaphore (30) + per-dashboard cap (4) + batching limits concurrent SDK connections to ≤ 30 at any time. This is within typical SQL Server default connection pool capacity (100) and IIS thread pool headroom. Exponential backoff and circuit breaker handle the absence of a Retry-After signal.

**Without mitigations**: the naive model would issue 240 concurrent Dataverse requests (20 users × 12 widgets), exceeding the 52-request cloud limit by 4.6× and risking on-prem saturation. The mitigation stack reduces this to 7 batched requests per user at most 6 concurrently, with a process-global cap of 40. The risk is fully controlled by design.

---

### Phase-4 Proof Obligations

DC-1 is cleared at the design level. The following must be proven by load test execution during Phase-4 build before the V2-Dashboard M2.5 milestone closes:

| ID | Obligation | Gate |
|---|---|---|
| DC-1a | Scenario 3 load test passes: 20 concurrent cold-cache opens, P95 per-widget ≤ 4 s, zero 429s on both targets | Before M2.5 milestone sign-off |
| DC-1b | QDB confirms record-ownership model for Customer-360 entities (RC-2 resolved) | Before production cache enabled for the Customer-360 dashboard |
| DC-1c | OBO / user impersonation mechanism confirmed functional on actual on-prem CRM 9.x target | Before on-prem dashboard execution smoke-tested in M1 integration |

---

### Assumptions Requiring QDB Confirmation

| ID | Assumption | If wrong |
|---|---|---|
| ASSUMPTION-1 | Peak concurrency = 20 simultaneous dashboard opens | Re-tune global semaphore + per-dashboard cap; re-run load test |
| ASSUMPTION-2 | Customer-360 entities (account, qdb_loanapplication, qdb_facility) are BU-level or organisation-level owned, not user-level owned | Extend per-widget cache key to include userId for user-owned entities |

---

### ADR Required Before Build

**ADR-RPT-008: Dashboard fan-out concurrency control and OBO query execution model** must be written and accepted before `DashboardExecutionService` implementation begins.

**Context**: The `DashboardExecutionService` fans out up to 12 independent CRM queries per dashboard execution. Without architectural controls, 20 simultaneous executions would issue 240 concurrent requests, exceeding Dataverse limits and risking on-prem saturation.

**Decision**: (1) Use MSAL OBO tokens for Dataverse queries on the cloud path. (2) Implement a global process-level `SemaphoreSlim` (40 cloud / 30 on-prem). (3) Keep per-dashboard parallelism cap at 6 (cloud) / 4 (on-prem). (4) Batch same-entity widget queries via ExecuteMultiple / OData $batch with `ContinueOnError = true`. (5) Pre-warm cache on publish via `IJobOrchestrator` at LOW priority.

**Consequences**: OBO adds ~50 ms first-call overhead per user per execution (MSAL token acquisition; cached within 1h). ExecuteMultiple batching adds grouping logic in `DashboardExecutionService`. Pre-warm adds one new job type to `IJobOrchestrator`. All configuration values must be environment-variable-configurable (Constitution Article V). Configuration keys: `DashboardEngine:MaxGlobalConcurrency`, `DashboardEngine:PerDashboardParallelism`.

**Extends**: ADR-RPT-003 (async staged execution), ADR-RPT-007 (role-keyed cache with post-retrieval masking). The widget cache is an extension of ADR-RPT-007, not a new cache design. The widget cache key adds `widgetId` to the existing role-keyed pattern.

---

## Appendix: DC-1 Sign-Off

| Role | Name | Decision | Date |
|---|---|---|---|
| Architect | Maqsad AI | DC-1 CLEARED (design) | 2026-07-19 |
| CEO (to acknowledge) | — | Awaiting | — |
