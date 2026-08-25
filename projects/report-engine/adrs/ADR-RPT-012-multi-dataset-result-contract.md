# ADR-RPT-012 — Multi-dataset result contract: a dataset collection, with the single-dataset shape preserved verbatim

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-08-25 |
| **Decided by** | Architect (CEO-approved scope, ADD-002 Phase A) |
| **Implements** | ADD-002 MDS-FR-001 … 010, 021 … 028 |
| **Amends** | ADR-RPT-011 (execution shape inside the plugin) |
| **Reopens** | **C-6** — see §Consequences |

## Context

`ADD-002` authorises a report to declare several datasets, each marked `joined` (merged into the root
result set on a key) or `standalone` (its own result set). The CEO approved Phase A for build.

The engine's storage model is already plural. `ReportDefinition.DataSources` is a collection, and
`ReportQueryBuilder` already flattens **every** source's entity mappings into one FetchXML — a root
entity plus a `link-entity` per mapping carrying a valid `JoinExpressionJson`, ordered by `Depth`.

What is singular is everything **after** the query:

- `ReportResultJson` emits exactly one `{columns, rows, truncated}`.
- `SdkReportEngine:91` takes `ReportSourcePlan.Primary()` and ignores the rest — a second source
  typed CRM View, FetchXML or Static Dataset has its payload **silently dropped**.

Every consumer reads the singular shape: all layout renderers, all four exports, `DrilldownPlanner`,
the dashboard widgets, and `test-result-contract.mjs`. Changing it touches the whole downstream.

## Decision

### 1. The result becomes a dataset collection

```
{ "datasets": [ { "id", "name", "role", "columns", "rows", "truncated", "ms", "status" } ] }
```

`role` is `root` | `joined` | `standalone`. `status` is per dataset, carrying its own failure — the
report reports **partial success** rather than one overall verdict (MDS-FR-028).

### 2. A single-dataset report emits today's shape, byte-for-byte

This is the load-bearing half of the decision. When a report has one dataset the engine emits
`{columns, rows, truncated}` exactly as now — not a one-element collection.

The alternative, versioning every consumer at once, was rejected: it makes a contract change that
must be correct in four export formats, every layout, drilldown and the dashboard land on the same
day, with no way to ship incrementally. Under this decision **every currently deployed report keeps
its existing wire format**, and the new shape appears only for reports that opt into it by declaring
a second dataset. Nothing already live changes on ship day.

⚠️ The cost is two shapes to maintain. It is accepted deliberately and bounded: emission is decided
in one place, and the reader helper normalises the singular form into a one-element collection so no
consumer past the boundary sees both.

### 3. Joining is decided per dataset, and the two join paths must agree

A `joined` CRM dataset continues to join **in FetchXML**, through the existing link-entity path — it
is faster, and the platform enforces row-level security across the join.

Only a source the platform cannot reach joins **in memory** (`GroupJoin`, Area 12).

🔴 Both paths must expose the **same cardinality semantics**. `ReportQueryBuilder` already honours
inner/outer via `JoinType`; the in-memory path must offer the same authored choice — drop the
unmatched root row, or keep it with empty columns. Two join paths that silently differ on unmatched
rows would produce a report whose row count depends on where the data came from.

### 4. Execution order is deterministic, and datasets do not run concurrently

Root, then joined, then standalone (MDS-FR-006). Sequential, not parallel.

Concurrency inside a sandboxed plugin was rejected: ADR-RPT-011 §Fan-out records that in-CRM
execution is **already per-user**, which is what ADR-RPT-008's concurrency controls existed to
achieve. Adding parallelism inside a single execution reintroduces the fan-out problem the move
in-CRM dissolved, and buys latency that §Consequences shows we cannot yet spend safely.

### 5. Failure is per dataset and named

A failed dataset renders as a **named failure block** (MDS-FR-016). It never renders as an empty
table — that is the exact defect ADD-002 §2 documents in the current silent-ignore behaviour, and
reproducing it under a new name would be worse for having been designed in.

### 6. Save-time validation replaces silent ignoring

Any declared source the engine will not execute is refused **at save**, with the reason
(MDS-FR-009). This closes a live authoring defect that exists today independently of this feature.

## Consequences

### 🔴 C-6 is reopened, and its conclusion does not transfer

`c6-scale-characterisation.md` concluded ADR-RPT-011 holds with 102× headroom, resting on the engine
issuing *"one FetchXML query capped at `top=5000`"* that *"does not page"*. This ADR makes execution
N sequential queries. The bound becomes N × 5,000, and §4 makes the latencies **add**.

⇒ C-6 must be re-characterised against a multi-dataset report. Phase A can be built and tested
against that measurement; **Phase B cannot ship without it**, because external latency is not ours to
control. This is pre-condition 1 of the four the CEO retained.

### Blast radius

Every result consumer changes: four exports, all layouts, `DrilldownPlanner`, dashboard widgets,
`test-result-contract.mjs`. §2 is what makes this incremental rather than a flag day.

- **XLSX**: one sheet per standalone dataset (MDS-FR-022).
- **CSV**: single-table by nature — exports the root and **names what it omitted** (MDS-FR-023). It
  must not silently export one dataset out of three.
- **Drilldown**: stays on the root; standalone datasets declare themselves not drillable.

### Schema

`qdb_reportdatasource` gains composition mode, join keys, execution order, enabled flag and a
per-dataset row limit. ⚠️ **Six of eleven existing rows have `qdb_sourcetype = null`** (C-8). Backfill
before shipping logic that switches on that column.

### Not decided here

The external execution path — outbound HTTP, credential custody, the on-premise allowlist — is
Phase B and belongs to **ADR-RPT-013**. This ADR deliberately stops at the contract, so Phase A does
not wait on it.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Version the contract; migrate all consumers at once | Forces four export formats, every layout, drilldown and the dashboard to land together and be correct on day one. §2 gets the same outcome incrementally |
| Always emit a collection, even for one dataset | Cleaner on paper; changes the wire format of every deployed report for no author-visible benefit |
| One result set always, "standalone" as a synthetic union | Datasets have different columns. A union needs a widened schema padded with nulls — the blank-cell defect fixed in `42c1e037`, reintroduced structurally |
| Run datasets in parallel | Reintroduces the fan-out concern ADR-RPT-011 dissolved, inside a two-minute ceiling with no measurement to justify it |
