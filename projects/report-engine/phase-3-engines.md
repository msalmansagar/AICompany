# Phase 3 Architecture — Engine Internal Designs (Workstream 3 of 4)

| | |
|---|---|
| **Engagement** | RPT-ENG-001 (report-engine) |
| **Document** | Data-provider, drilldown, filter/param, transformation, layout, export engines |
| **Runtime** | ASP.NET Core middle tier (C#/.NET); designer = React/Fluent web resource |
| **Date** | 2026-07-07 |

Design principles (per Maqsad AI standards): small focused interfaces, constructor DI, `Result<T>` over exceptions/null at boundaries, Open/Closed for new source/export types, no god classes. All engines are **stateless services** driven by the metadata tables (`qdb_report*`).

The common currency between engines is a normalized in-memory table:

```csharp
public sealed record ResultColumn(string Name, string DisplayName, ColumnDataType Type, string? Format);
public sealed record ResultRow(IReadOnlyDictionary<string, object?> Values);
public sealed class ResultTable
{
    public IReadOnlyList<ResultColumn> Columns { get; init; }
    public IReadOnlyList<ResultRow> Rows { get; init; }
    public IReadOnlyList<ResultGroup> Groups { get; init; }      // populated by grouping transform
    public IReadOnlyDictionary<string, object?> Aggregates { get; init; }
    public bool IsPartial { get; init; }                          // true if an external source failed (C-6)
    public IReadOnlyList<string> Warnings { get; init; }
}
```

Pipeline (orchestrated by `ReportExecutionService`):
`Provider(s) → combine → Transformations → Formulas → Layout render-model → Exporter`.

---

## 1. Data Provider Layer & source abstraction

### 1.1 Interfaces
```csharp
public interface IReportDataProvider
{
    SourceType Handles { get; }
    Task<Result<ResultTable>> FetchAsync(DataSourceConfig source, ExecutionContext ctx, CancellationToken ct);
}

public interface IReportDataProviderFactory
{
    IReportDataProvider For(SourceType type);   // resolves the registered provider (Open/Closed)
}
```
Implementations (V1 = CRM-native + Static; V2/V3 = external):
`FetchXmlProvider`, `QueryExpressionProvider`, `WebApiProvider`, `CrmViewProvider`, `CustomApiProvider`, `SqlProvider`, `RestApiProvider`, `StaticDatasetProvider`. New source = new provider registered in DI; nothing else changes.

### 1.2 Multi-source combine
`ISourceCombiner` performs an in-memory join of secondary sources onto the primary by `qdb_joinkeyleft`/`qdb_joinkeyright` (hash join). V1 executes a single primary source; V2/V3 enable combine. If a non-primary external source fails, the combiner emits the primary rows with `IsPartial = true` and a warning (graceful degradation, C-6 / R-3).

### 1.3 FetchXML limitation handling (core value — FR-032…FR-035)
The **`IQueryStrategySelector`** decides the mechanism per data source, so authors never hit raw platform errors:

```csharp
public interface IQueryStrategySelector
{
    QueryMechanism Choose(DataSourceConfig source, ReportRequirements reqs);
}
public enum QueryMechanism { FetchXml, QueryExpression, WebApi, CustomApi, PreAggregated, ExternalStaging }
```

Decision logic:

| Condition in the report requirements | Chosen mechanism | Why |
|---|---|---|
| Simple filter/sort, ≤ 2 related entities, no aggregation | **FetchXml** | Cheapest, native, cached view-friendly |
| Aggregation beyond FetchXML's 50k-row aggregate cap, or `distinct` + large sets | **PreAggregated** table, else **CustomApi** | FetchXML aggregate throws over the cap |
| Needs attributes/joins awkward in FetchXML, or dynamic column projection | **WebApi** (OData `$select/$expand/$filter`) | Flexible reads |
| Complex SDK-only logic (link-entity depth, late-bound, conditional joins) | **QueryExpression** | Full SDK power |
| Joins across **unrelated** entities or > platform link-entity depth | **CustomApi** (server-side, returns dataset) | FetchXML/OData cannot express it |
| External / cross-system data | **ExternalStaging** (staged then queried as native) | Keeps interactive path within the 2-min ceiling |

Paging: providers transparently follow the **5000-row paging cookie** (FetchXML) / `@odata.nextLink` (Web API), accumulating up to `qdb_reportdefinition.qdb_rowlimit`; exceeding it returns a **clear author-facing warning**, not a platform error (FR-035, NFR-004). Aggregate-cap breaches trigger automatic fallback to `PreAggregated`/`CustomApi` or a friendly message advising a pre-aggregation source.

---

## 2. Drilldown & Relationship engine

```csharp
public interface IDrilldownResolver
{
    Task<Result<ResultTable>> DrillAsync(ReportDefinition report, DrilldownRequest req, ExecutionContext ctx, CancellationToken ct);
    IReadOnlyList<DrilldownOption> OptionsFor(ResultRow row, int currentLevel);   // what a row can drill into
}
```
- Driven by `qdb_reportrelationship` rows ordered by `qdb_drilllevel`. **V1 = level 1 only**; V2 walks arbitrary levels (Customer→Applications→Facilities→…).
- **1:N / N:1** → CRM relationship metadata (`qdb_relationshipschemaname`) builds the child/parent query via the provider layer.
- **N:N** (V2) → resolves the intersect entity automatically.
- **ManualJoin / ExternalKey** (V2/V3) → join by `qdb_parentkey`/`qdb_childkey`; ExternalKey routes the child fetch through a connector (e.g. customer number → Core Banking).
- **Clickable row** (`qdb_opensrecord`, FR-044) → returns a navigation descriptor `{entity, id}` the web resource turns into `Xrm.Navigation.openForm`, respecting the runner's record-level security.
- **Sub-report** (`qdb_subreportid`, FR-043) → runs the child report with the parent row's keys injected as context parameters.

---

## 3. Filter & Parameter engine

```csharp
public interface IFilterCompiler   // one per query mechanism dialect
{
    QueryMechanism Dialect { get; }
    string Compile(IReadOnlyList<FilterClause> clauses, ExecutionContext ctx);   // → FetchXML <filter>, OData $filter, or SQL WHERE
}
public interface IParameterResolver
{
    IReadOnlyDictionary<string, object?> Resolve(IReadOnlyList<ReportParameter> parms, RuntimeInputs inputs, ExecutionContext ctx);
}
```
- **Typed inputs** (`qdb_parametertype`) render the correct Fluent control in the designer/runtime prompt; the resolver coerces/validates each.
- **Operator set** (`qdb_operator`) maps to each dialect. Relative-date operators resolve at run time:
  - `LastXDays` → `createdon ≥ today−X`; `ThisMonth`/`ThisYear` → date-range bounds computed in the **runner's timezone**.
  - `Between`/`In`/`NotIn` read a JSON list from `qdb_value`.
- **Context tokens** (`qdb_contexttoken`) resolve from `ExecutionContext`: `CurrentUser` → runner id, `CurrentBU` → runner BU, `CurrentRecord`/`CurrentEntity` → ribbon-passed context (§ workstream 1 ribbon design).
- **Advanced AND/OR** (FR-049, V2): `qdb_logicalgroup` + `qdb_andor` build nested condition groups; the compiler emits nested `<filter type="and|or">` (FetchXML) or grouped OData.
- **Security-role filter** (FR-047, V2): the resolver injects an extra clause based on the runner's roles before compilation (server-side, cannot be bypassed).

---

## 4. Transformation engine

A **chain-of-responsibility pipeline** over `ResultTable`, steps ordered by `qdb_reporttransformation.qdb_sequence`, then formulas.

```csharp
public interface ITransformation
{
    TransformationType Type { get; }
    Result<ResultTable> Apply(ResultTable input, TransformationConfig cfg, ExecutionContext ctx);
}
public interface ITransformationPipeline
{
    Result<ResultTable> Run(ResultTable input, IReadOnlyList<TransformationConfig> steps, ExecutionContext ctx);
}
```
Step implementations (V1 must-have marked ✱): Rename✱, LookupResolve✱ (GUID→display name via metadata cache), OptionSetResolve✱ (value→localized label), CurrencyFormat✱, DateFormat✱, NumberFormat✱, NullHandling✱, DataMask✱, Aggregation✱, Grouping✱, ConditionalValue, ValueMapping, Merge, Split, Pivot, JsonFlatten, ExternalMap.

- **Masking (DataMask, BR-5):** applied to columns where `qdb_reportcolumn.qdb_ismasked = true`, **before** the render model is built and therefore before any export. Masking is never done client-side.
- **Formula fields (FR-011/FR-067) via NCalc:** the `NCalcFormulaEvaluator` runs each `qdb_reportformula.qdb_expression` per row with the row's columns as variables. **Hard sandbox (C-5):** custom-function resolution is disabled/whitelisted, no reflection, no I/O — NCalc's closed grammar cannot execute arbitrary code (Jint/DynamicExpresso were rejected in GitHub research for exactly this reason). Expression parse failures return a `Result` error surfaced to the author at design time (preview) and logged at run time.
- **Grouping** produces `ResultTable.Groups` with per-group and grand-total aggregates for grouped/summary layouts.

Extensibility seam: a new transform = implement `ITransformation`, register in DI, add a `qdb_transformationtype` option — no pipeline change (Open/Closed).

---

## 5. Layout / rendering engine

Produces a **layout-neutral render model** (not format-specific), consumed by every exporter — this is what lets one report render to PDF/Word/Excel/HTML/Image consistently.

```csharp
public interface ILayoutRenderer
{
    LayoutType Type { get; }
    RenderModel Build(ResultTable data, LayoutConfig layout, ExecutionContext ctx);
}
public sealed class RenderModel   // sections, bands, groups, cells, styles, chart specs — format-agnostic
{ /* header, body bands, group headers/footers, totals, page-break hints, chart definitions, chrome */ }
```
Renderers (V1: Table, Grouped, Summary; V2: CardKPI, MasterDetail, Drilldown, Chart; V3: LetterDocument, Dashboard). Chrome (header/footer/logo/page-number/generated-date/generated-by/watermark) and totals/subtotals/page-breaks/conditional-formatting come from `qdb_reportlayout`. **Charts** are rendered by **ScottPlot** to an image the exporters embed. Conditional formatting evaluates row/cell rules (reusing the NCalc evaluator) into cell styles on the render model.

---

## 6. Export engine

```csharp
public interface IReportExporter
{
    ExportFormat Format { get; }
    Task<Result<ExportArtifact>> ExportAsync(RenderModel model, ExportOptions opts, CancellationToken ct);
}
public interface IReportExporterFactory { IReportExporter For(ExportFormat format); }
public sealed record ExportArtifact(byte[] Content, string ContentType, string FileName);
```
Implementations by adopted library:

| Format | Exporter | Library | Notes |
|---|---|---|---|
| PDF | `PdfExporter` | **QuestPDF** | Fluent document API over the render model; revenue-tier license check at go-live |
| Excel | `ExcelExporter` | **ClosedXML** | Typed cells, formats, grouping; avoids EPPlus license trap |
| Word | `WordExporter` | **Open XML SDK** | Tables + document chrome for letter/document reports |
| CSV | `CsvExporter` | built-in | RFC-4180 |
| Image | `ImageExporter` | **ScottPlot** / render-to-bitmap | Chart/card PNG |
| HTML | `HtmlExporter` | built-in (Razor/StringBuilder) | Standalone HTML |

- **Access control + masking enforced before export** (BR-5/6): the exporter only ever sees the already-masked, already-authorized `RenderModel`; it performs no data access itself.
- **On-prem vs cloud:** the exporter interface is identical on both. The only per-target concern is font/GDI availability for QuestPDF/ScottPlot on some on-prem hosts — validated by the **export-parity spike** the CEO required (C-7). New format = new `IReportExporter` + `qdb_exportformat` value (Open/Closed).

---

## 7. Summary of interfaces & extensibility seams
- `IReportDataProvider` (+factory) — **new source type**
- `IQueryStrategySelector` — FetchXML-limitation routing
- `ISourceCombiner` — multi-source join
- `IDrilldownResolver` — drilldown/relationships
- `IFilterCompiler` (per dialect) + `IParameterResolver`
- `ITransformation` (+`ITransformationPipeline`) — **new transform**
- `NCalcFormulaEvaluator` — sandboxed formulas
- `ILayoutRenderer` — **new layout type**
- `IReportExporter` (+factory) — **new export format**

Every seam is a small interface resolved via DI, so V2/V3 capabilities (external sources, N:N/multi-level drilldown, pivot/merge/split, card/chart/letter layouts, Word/image already in V1) extend the engine without modifying its core (Open/Closed, DIP).
