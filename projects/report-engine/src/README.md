# RPT-ENG-001 — Middle-Tier (skeleton)

ASP.NET Core (.NET 8) middle tier for the Report Engine, per Phase-3 architecture and ADR-RPT-002.
This is a **scaffold**: structure, abstractions, DI wiring, and the `DashboardExecutionService`
skeleton (ADR-RPT-008). Bodies that require a live CRM / real rendering are marked `// TODO(build)`.

## Projects
| Project | Responsibility |
|---|---|
| **Qdb.ReportEngine.Core** | Domain models, abstractions (interfaces), configuration, `Result<T>`. No I/O. |
| **Qdb.ReportEngine.Execution** | Engine implementations — dashboard fan-out (ADR-RPT-008), Dataverse access, resilience. |
| **Qdb.ReportEngine.Api** | ASP.NET Core Web API — controllers, DI composition, configuration. |

## ADR-RPT-008 map (DashboardExecutionService)
1. Delegated (OBO/impersonation) execution → `IDataverseConnectionFactory`
2. Two-level concurrency caps → `DashboardConcurrencyGate`
3. Same-entity `$batch` / `ExecuteMultiple` grouping → `WidgetQueryPlanner`
4. Role-keyed cache + pre-warm → `ICacheStore` (ADR-RPT-007) + cache-key builder
5. Progressive (staged) load → `IDashboardExecutionService.ExecuteStreamAsync`
6. Resilience (Retry-After / circuit breaker / coalescing) → `IWidgetExecutionPolicy`, `IInFlightRequestCoalescer`

## Status
Not built — skeleton only. Real query/exec/exports and live-org provisioning are Phase-4 build
work under the AUTH-C-* conditions (see `phase-4-authorization-v2-dashboard.md`).
DC-1a load test is the M2.5 exit gate.
