# ADR-RPT-011 — Execute in CRM: web resource + Dataverse plugin, no hosted middle tier

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-26 |
| **Decided by** | User (MSS Technologies) + Architect |
| **Supersedes** | **ADR-RPT-002** (ASP.NET Core middle-tier execution service) |
| **Amends** | ADR-RPT-006 (entry point), ADR-RPT-008 (fan-out), ADR-RPT-010 (auth) |
| **Resolves** | **B1** (dissolved), **B6** (largely dissolved) |

## Context

The engine was built as a three-tier system: a CRM web resource, a **hosted ASP.NET Core middle
tier**, and Dataverse. Everything heavy — query execution, exports, charts, caching — lived in the
middle tier (ADR-RPT-002).

That tier was never hosted. Reaching production required an App Service or on-prem IIS, and with it
a chain of consequences: authenticating callers to it (B1), naming a compliant region for it (B6 /
AUTH-C-2), CORS, TLS, a deployment pipeline, and two different credential paths because on-premise
CRM 9.x has no Entra tenant to issue tokens.

The user's direction is to remove that tier entirely. The engine must run **inside CRM**, with no
externally hosted component of any kind.

## Decision

Execute the engine inside Dataverse, split across two runtimes that both ship as solution
components:

| Concern | Runtime | Why there |
|---|---|---|
| UI, layout, rendering, charts | **Web resource** (browser) | Already there; SVG charts beat server-rendered PNG for interactivity |
| Row shaping, formatting, **formulas, transformations** | **Web resource** | Presentation-layer computation over rows already fetched |
| Exports (CSV, XLSX, DOCX, PDF, PNG) | **Web resource** | Produces a file for the user who asked; no server round trip |
| Definition loading, FetchXML build, **query execution** | **Plugin** (`qdb_RunReport`) | See audit rationale below |
| **Execution audit log** | **Plugin** | The reason a plugin exists at all |

### Why a plugin at all, when the browser could query Dataverse directly

Because of **B4**. A regulator asks who ran which report, over whose data, when. If the browser both
fetches the data and writes the log, a user can keep the data and skip the log — devtools, blocked
request, done. A suppressible audit log is not an audit log.

Routing retrieval through the plugin makes the log **structurally unavoidable**: the same call that
returns rows writes the record, so there is no way to obtain report output without being logged.

This is the only reason the plugin exists. It is not a performance tier and holds no state.

> **Scope of the claim, stated honestly.** This guarantees "no report ran without a log", not "this
> user never saw this data". The same user can read the same rows through Advanced Find, an Excel
> export or the Web API, none of which write a report-execution log. The engine's audit trail is
> therefore complete *for the engine*, and Dataverse's own security remains what governs access.

### Authentication (amends ADR-RPT-010)

There is no longer anything to authenticate to. A web resource runs in an authenticated CRM session,
and a plugin executes under `InitiatingUserId`, so queries run as the user by construction — no
tokens, no service secret, no impersonation header, no forgeable identity.

**B1 dissolves rather than being fixed.** The dual-scheme middle-tier auth from ADR-RPT-010 becomes
dormant along with the tier it protected, and `TODO(RPT-B1-CLOUD)` — the interim environment-variable
secret — goes away with it. The `X-Report-Caller-Id` header disappears entirely.

### Data residency (amends B6)

No data is processed outside Dataverse, so there is no second region to place or get signed off.
**B6 largely dissolves**: what remains is QDB's ordinary Dataverse residency posture, not a new
processing location this project introduced.

### Portability constraint

A Dataverse plugin assembly must be **self-contained** — it cannot reference sibling custom
assemblies, and plugin packages (which would allow it) are not available on on-premise 9.x, a V1
target. The shared engine is therefore **source-linked** into the plugin rather than referenced as
an assembly, and the plugin carries **no NuGet dependencies** beyond the CRM SDK.

This is what puts formulas and transformations in the browser: they are the only ported logic needing
a third-party library (NCalc), and keeping them out means no ILRepack step, no merged-assembly
strong-naming complications, and less work inside the plugin's two-minute ceiling. NCalcSync 6.4.0
does ship a `net462` target, so this can be revisited if formulas must be server-side.

The shared logic multi-targets `net8.0;net462`; a small polyfill file supplies `IsExternalInit` and
`RequiredMemberAttribute` so records and `required` members compile for the sandbox.

### Fan-out (amends ADR-RPT-008)

ADR-RPT-008's controls existed for a shared server: a global semaphore, cross-user cache, in-flight
coalescing, and OBO to distribute quota per identity. In-CRM execution is **already per-user**, which
was that design's goal, so the quota argument is satisfied by construction.

What is lost is cross-user caching and coalescing. Dashboard fan-out is now bounded client-side (the
per-dashboard widget cap survives) and by Dataverse's per-user service-protection limits.
**DC-1a load testing must be redone against this model** — the original spike measured a topology
that no longer exists.

## Consequences

**Gained.** B1 dissolved; B6 largely dissolved; no hosting, CORS, TLS, or deployment pipeline; one
identical path for cloud and on-premise, removing the dual-credential problem; deployment is a
solution import.

**Lost, and worth being clear about.**

- **Export fidelity.** JS libraries for XLSX/DOCX/PDF are weaker than ClosedXML, Open XML SDK and
  PDFsharp, and add weight to the web resource. Acceptable against the "functional, not pixel-perfect"
  SSRS parity target, but it is a downgrade.
- **Large result sets.** No server-side paging, streaming or caching; browser memory and Dataverse
  page limits become the ceiling.
- **Long-running and scheduled reports.** A closed tab kills a run, and nothing executes unattended.
  Scheduled distribution would need Power Automate or an async plugin — out of V1.
- **The middle tier's host.** Controllers, DI, auth, and the ASP.NET Core host are retired. The pure
  engine logic is kept and moves into the shared, multi-targeted project.

## Migration

1. Extract pure logic (models, `Result`/`DomainError`, definition assembler, `ReportQueryBuilder`,
   `ReportRowShaper`) into a shared `net8.0;net462` project with net462 polyfills.
2. Replace the Web API/OData/`$batch` data layer with `IOrganizationService` + `FetchExpression`.
   Lookups arrive as `EntityReference`, not `_x_value` — the OData row-reader fallback does not apply.
3. Expand `qdb_RunReport` from a relay to the data engine, writing `qdb_reportexecutionlog` on every
   execution.
4. Point the runtime viewer and designer at `Xrm.WebApi.online.execute` instead of `fetch`.
5. Move exports, charts, formulas and transformations into the web resource.
6. Retire the ASP.NET Core host; keep the engine logic.
