# RPT-ENG-001 — Build-Phase Code Review + Security & Compliance Audit (Consolidated)

| | |
|---|---|
| **Engagement** | RPT-ENG-001 — Metadata-driven Report Engine (QDB) |
| **Date** | 2026-07-22 |
| **Reviewers** | code-reviewer (clean-code/correctness) + auditor (security/compliance) |
| **Scope** | Qdb.ReportEngine.{Core,Execution,Api,Tests}, report-runtime.html/report-designer.html, provisioning scripts |
| **Verdict** | **NOT cleared for production.** Architecturally sound; gaps are implementation-completeness, not design. Resolve blockers → QA-validated staging → PDPPL sign-off → production. |

Both reviews independently reached the same conclusion and overlap heavily on the top findings.

## Go-live BLOCKERS (must fix; none waivable)

| # | Finding | Where | Why it blocks |
|---|---|---|---|
| **B1** | **No authentication + forgeable identity.** No auth middleware on any route; caller identity taken from the raw `X-Report-Caller-Id`/`MSCRMCallerID` header and impersonated in Dataverse. | `Program.cs`; `ReportsController`/`DashboardsController` BuildContext | Anyone network-reachable can impersonate any user (incl. sysadmin) and export any customer data. Complete access-control bypass (OWASP A01/A07). |
| **B2** | **`CrmSecurityEnforcer` is a no-op stub** — `CanReadEntityAsync` always returns true. | `Execution/Security/CrmSecurityEnforcer.cs` | Per-entity permission gate never runs → any authenticated caller can query any entity. Fails AUTH-C-8. |
| **B3** | **Dashboard execute/stream run a client-supplied definition** and ignore the route `dashboardId`. | `DashboardsController` Execute/Stream | Caller composes arbitrary widget queries over any entity, bypassing the stored definition's record-level security. (Reports do this correctly — load by id.) |
| **B4** | **No execution audit-log writer.** `qdb_reportexecutionlog`/`qdb_reportauditlog` tables exist but nothing writes to them. | `ReportExecutor`, `DashboardExecutionService` | Cannot answer "who ran what, for which customer, when." Fails CEO success-criterion #4, PDPPL accountability, QCB audit. Regulator exam → empty result. |
| **B5** | **CORS wildcard fallback** — `SetIsOriginAllowed(_ => true)` when `Cors:Origins` unset. | `Program.cs` | Any origin can call the API; combined with B1 = drive-by data theft. Must be a hard startup failure, not a permissive default. |
| **B6** | **PDPPL data-residency not enforced; AUTH-C-2 + AUTH-C-6 open.** No code reads/validates `qdb_residencyregion`; host region unspecified; in-memory cache rests PII ≤10 min. | runtime hosting + connector path | Processing bank PII outside an approved region is illegal under PDPPL. No Customer-360 / PII report to prod without QDB's written region sign-off. **Needs QDB input.** |

## Pre-production (fix before staging promotion)

| # | Finding | Where | Note |
|---|---|---|---|
| P1 | In-flight coalescer captures only the first caller's `CancellationToken` → one cancel fails all concurrent waiters. | `InFlightRequestCoalescer.cs` | Correctness. Use a linked-token source. |
| P2 | In-memory cache: unbounded, no eviction, no distributed backing. | `InMemoryCacheStore`, DI | Memory DoS + wrong sharing across instances. Swap to distributed (Redis) per ADR-RPT-007; bound the dev fallback. |
| P3 | NCalc formula eval: no timeout, no depth/length limit. | `FormulaEvaluator.cs` | CPU/stack DoS from a malicious/misconfigured formula. Add ~2s timeout + depth guard. |
| P4 | Malformed **Masking** config silently swallowed (no log). | `ReportTransformationPipeline.ParseConfig` | PII could go **unmasked** with no signal. Log a structured warning. |
| P5 | Filter **GroupId nesting not honored** — all filters flattened under the first filter's AND/OR. | `ReportQueryBuilder.AddFilters` | Silent scope expansion, e.g. `(a OR b) AND c` becomes an OR of everything. Group by GroupId or document+test the single-group limit. |
| P6 | No HTTPS redirection / HSTS. | `Program.cs` | Enforce TLS (or at the load balancer). |
| P7 | OBO delegated-token path unimplemented → all queries use the SP identity; SP quota, not per-user. | `MsalTokenProvider` | Gated on AUTH-C-2 region. Monitor SP quota until then. |
| P8 | Impersonation privilege not validated at runtime — if the SP lacked "Act on Behalf", queries silently run as the SP. | `DataverseWebApiConnection` | (Confirmed SP *has* the privilege on org5869857f, but a missing runtime guard = latent privilege-escalation on misconfig.) |
| P9 | SP Dataverse security role undocumented; least-privilege unverified. | ops/config | Document + restrict to read-only on report-engine tables + OBO grant. |

## Hardening (lower priority)

- **CSV newline**: `AppendLine` emits `\n` on Linux — RFC 4180 wants `\r\n` (`CsvReportExporter`). *(Quoting itself is correct.)*
- **Dataverse error body logged verbatim** → schema/query leakage into app logs (`DataverseWebApiConnection`). Log status + sanitized summary only.
- **No rate limiting / export size limits** (DoS + bulk exfiltration).
- **Hardcoded fallbacks**: live org URL in scripts; `apiBase: "http://localhost:5215"` in the viewer; `DefaultRowLimit`/`MaxRetries` should be config.
- **SSRF**: validate `qdb_externalconnector.qdb_baseurl` against an allow-list before outbound calls.
- **Data classification**: no `qdb_ispii` flag → masking is manual/opt-in; default-mask PII columns.
- **Clean-code**: a few >20-line methods (`ReportQueryBuilder.Build/BuildCondition`, `PdfReportExporter.Export`) and >3-param methods (`DashboardExecutionService.FetchMissesAsync/MaterialiseAsync`, `ImageReportExporter.Draw/DrawRow`); extract helpers / parameter objects.
- **Viewer JS**: object URLs never `revokeObjectURL`'d (leak); `parseDur` mis-parses a day component; `r.json().catch(()=>null)` masks the underlying HTTP error.

## Passed / commended (no change needed)
- `Result<T>` used consistently (no null-for-failure); guard clauses at every entry point.
- **FetchXML built via LINQ-to-XML** → XML/FetchXML injection structurally impossible.
- Runtime viewer `esc()` covers `& < > "` → XSS-safe interpolation.
- Resilience pipeline (Polly retry + circuit breaker + concurrency gate + coalescer) well-designed; throttle-propagates / other-fails-Result pattern correct.
- NCalc is the right sandboxed formula choice (ADR-RPT-005); its broad catch is a justified "a bad formula must never break the report" policy.
- No secrets hardcoded in source; scripts load from `.env`.
- 9 accepted ADRs — disciplined architectural governance.

## Recommended fix order
1. **B5, B3, P4, hardening one-liners** — code-only, no decisions (CORS hard-fail; dashboard loads by id via the now-existing `DashboardDefinitionLoader`; masking log; CSV CRLF; error-body sanitize; blob revoke; parseDur; script URL fallback).
2. **B2, B4, P3, P8** — implement `CrmSecurityEnforcer` (entity read-privilege check), an `IReportExecutionLogger` writing the audit tables, NCalc timeout+depth guard, impersonation-privilege guard.
3. **B1** — needs the auth-scheme confirmation (AAD JWT bearer proposed): add auth middleware + `[Authorize]`, derive caller from a validated token claim, reject unauthenticated with 401.
4. **B6, P7** — need QDB: named Azure region (AUTH-C-2) + written PDPPL sign-off (AUTH-C-6); then implement OBO + residency validation.
5. **P1, P2, P6, remaining hardening/clean-code.**
