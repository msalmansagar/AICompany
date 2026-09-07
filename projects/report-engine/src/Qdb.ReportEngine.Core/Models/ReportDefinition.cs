namespace Qdb.ReportEngine.Core.Models;

/// <summary>
/// The runtime representation of a report, loaded from the <c>qdb_reportdefinition</c> table and
/// its children. This is the execution-time model — the shape the query pipeline and renderer
/// consume — decoupled from the storage schema. Operational children (execution/audit log, cache,
/// ribbon, security) are not part of this load; they are read on their own paths.
/// </summary>
public sealed record ReportDefinition
{
    public required Guid Id { get; init; }

    public required string Name { get; init; }

    public string? ReportCode { get; init; }

    public string? Description { get; init; }

    /// <summary>Primary entity the report is built on (logical name).</summary>
    public string? MainEntityLogicalName { get; init; }

    public CodedValue? Category { get; init; }

    public CodedValue? Module { get; init; }

    public CodedValue? Status { get; init; }

    public CodedValue? ExecutionMode { get; init; }

    /// <summary>Per-report governance flag (qdb_isgoverned).</summary>
    public bool IsGoverned { get; init; }

    /// <summary>Result-row safety cap (qdb_rowlimit), or <c>null</c> for the engine default.</summary>
    public int? RowLimit { get; init; }

    /// <summary>Execution timeout in milliseconds (qdb_timeoutms), or <c>null</c> for the default.</summary>
    public int? TimeoutMs { get; init; }

    public IReadOnlyList<ReportDataSource> DataSources { get; init; } = [];

    public IReadOnlyList<ReportFilter> Filters { get; init; } = [];

    public IReadOnlyList<ReportParameter> Parameters { get; init; } = [];

    /// <summary>Computed columns evaluated per row after the query, in evaluation order.</summary>
    public IReadOnlyList<ReportFormula> Formulas { get; init; } = [];

    /// <summary>Post-query dataset transformations, applied in step order.</summary>
    public IReadOnlyList<ReportTransformation> Transformations { get; init; } = [];

    /// <summary>Relationships to related entities/reports (drilldown, sub-report, inline expansion).</summary>
    public IReadOnlyList<ReportRelationship> Relationships { get; init; } = [];

    /// <summary>The report's layout, if one is configured.</summary>
    public ReportLayout? Layout { get; init; }
}

/// <summary>A post-query transformation step (qdb_reporttransformation) configured by JSON.</summary>
public sealed record ReportTransformation
{
    public required Guid Id { get; init; }

    public CodedValue? TransformType { get; init; }

    /// <summary>Transform-specific configuration as JSON.</summary>
    public string? ConfigJson { get; init; }

    public int StepOrder { get; init; }

    public bool Enabled { get; init; }
}

/// <summary>A relationship from the report to related data (qdb_reportrelationship) — drives drilldown.</summary>
public sealed record ReportRelationship
{
    public required Guid Id { get; init; }

    public CodedValue? RelationshipType { get; init; }

    /// <summary>How the related data opens: open record, sub-report, or inline expansion.</summary>
    public CodedValue? OpenType { get; init; }

    public string? ParentAlias { get; init; }

    public string? ParentKey { get; init; }

    public string? ChildAlias { get; init; }

    public string? ChildKey { get; init; }

    public int Depth { get; init; }

    public string? ExternalJoinJson { get; init; }

    /// <summary>The report embedded as a sub-report (qdb_subreportid), when this opens a sub-report.</summary>
    public Guid? SubReportId { get; init; }
}

/// <summary>A computed column (qdb_reportformula): an expression evaluated per row over other columns.</summary>
public sealed record ReportFormula
{
    public required Guid Id { get; init; }

    /// <summary>Output column alias for the computed value.</summary>
    public string? FormulaAlias { get; init; }

    /// <summary>The expression (NCalc DSL) referencing other column aliases.</summary>
    public string? Expression { get; init; }

    public CodedValue? ResultDataType { get; init; }

    /// <summary>Order this formula is evaluated in; later formulas may reference earlier results.</summary>
    public int EvaluationOrder { get; init; }

    public bool IsConditional { get; init; }
}

/// <summary>A data source within a report (qdb_reportdatasource) and its entity mappings.</summary>
public sealed record ReportDataSource
{
    public required Guid Id { get; init; }

    public string? Name { get; init; }

    public CodedValue? SourceType { get; init; }

    public int ExecutionOrder { get; init; }

    public bool IsPrimary { get; init; }

    public string? SourceAlias { get; init; }

    /// <summary>
    /// What the source type points at: a saved view's name, a FetchXML document, or inline rows for a
    /// static dataset. Empty when the engine builds the query from the columns and filters itself.
    /// </summary>
    public string? QueryPayload { get; init; }

    /// <summary>
    /// Whether this source merges into the root result set or renders as its own block (MDS-FR-002).
    /// One of <see cref="DatasetComposition"/>.
    ///
    /// Absent means <see cref="DatasetComposition.Joined"/>, which is what the engine has always done
    /// — every source's mappings were flattened into one query. Existing reports therefore behave
    /// identically without being migrated.
    /// </summary>
    public string Composition { get; init; } = DatasetComposition.Joined;

    /// <summary>
    /// The attribute on THIS dataset that points at the parent — e.g. a Requested Facility's
    /// <c>qdb_termsheetid</c> (MDS-FR-003).
    ///
    /// Empty means the block is independent and runs unscoped. That is legitimate: not every
    /// standalone dataset belongs to the root.
    /// </summary>
    public string? JoinFromKey { get; init; }

    /// <summary>
    /// The attribute on the ROOT whose value the parent is identified by — e.g. the Termsheet's own
    /// <c>qdb_termsheetid</c>. The root must actually return this column, or the block cannot be
    /// scoped and says so rather than showing every row in the table.
    /// </summary>
    public string? JoinToKey { get; init; }

    /// <summary>
    /// A disabled dataset is kept but not executed (MDS-FR-007), so an author can isolate a slow or
    /// broken source without losing how it was configured.
    ///
    /// Absent means enabled: every source stored before the column existed must keep running.
    /// </summary>
    public bool IsEnabled { get; init; } = true;

    /// <summary>
    /// This dataset's own row cap (MDS-FR-008), or null to use the report's. A child block usually
    /// wants a different bound from the report it hangs off.
    /// </summary>
    public int? RowLimit { get; init; }

    public IReadOnlyList<ReportEntityMapping> EntityMappings { get; init; } = [];
}

/// <summary>How a data source composes into its report's output (MDS-FR-002, ADR-RPT-012 §3).</summary>
public static class DatasetComposition
{
    /// <summary>Merged into the root result set on a key. The default, and the historical behaviour.</summary>
    public const string Joined = "joined";

    /// <summary>Rendered as its own block, with its own columns and rows.</summary>
    public const string Standalone = "standalone";

    public static bool IsStandalone(ReportDataSource? source) =>
        string.Equals(source?.Composition, Standalone, StringComparison.OrdinalIgnoreCase);
}

/// <summary>An entity mapped inside a data source (qdb_reportentitymapping) and its columns.</summary>
public sealed record ReportEntityMapping
{
    public required Guid Id { get; init; }

    public string? EntityLogicalName { get; init; }

    public string? EntityAlias { get; init; }

    public int Depth { get; init; }

    public CodedValue? JoinType { get; init; }

    /// <summary>
    /// How this entity links to its parent, as <c>{"from":"&lt;attribute on this entity&gt;",
    /// "to":"&lt;attribute on the parent&gt;"}</c>. Empty on the root mapping, which has no parent.
    /// Stored as JSON rather than two columns because a future composite key needs no schema change.
    /// </summary>
    public string? JoinExpressionJson { get; init; }

    public IReadOnlyList<ReportColumn> Columns { get; init; } = [];
}

/// <summary>A projected column (qdb_reportcolumn).</summary>
public sealed record ReportColumn
{
    public required Guid Id { get; init; }

    public string? ColumnLogicalName { get; init; }

    /// <summary>
    /// The heading a reader sees. Distinct from <see cref="OutputAlias"/>, which is the key the row
    /// arrives under: a column drawn from a view's linked table is keyed by that view's own alias
    /// (<c>accountprimarycontactidcontactcontactid.emailaddress1</c>), which is no one's idea of a
    /// column heading.
    /// </summary>
    public string? DisplayName { get; init; }

    public string? OutputAlias { get; init; }

    public CodedValue? DataType { get; init; }

    public CodedValue? AggregateFunction { get; init; }

    public int SortOrder { get; init; }

    public int GroupOrder { get; init; }

    public bool IsVisible { get; init; }
}

/// <summary>A filter clause (qdb_reportfilter).</summary>
public sealed record ReportFilter
{
    public required Guid Id { get; init; }

    public string? FieldAlias { get; init; }

    public CodedValue? Operator { get; init; }

    public string? Value { get; init; }

    public CodedValue? ValueType { get; init; }

    public int Sequence { get; init; }

    public CodedValue? GroupOperator { get; init; }

    public string? GroupId { get; init; }

    public bool IsRuntimePrompt { get; init; }

    /// <summary>
    /// The dataset this filter belongs to, or null for the report's root query. A bound filter is
    /// applied only when that dataset's own query is built — which is how a standalone block gets
    /// filters that name ITS table's attributes instead of the root's.
    /// </summary>
    public Guid? DataSourceId { get; init; }
}

/// <summary>A runtime parameter (qdb_reportparameter).</summary>
public sealed record ReportParameter
{
    public required Guid Id { get; init; }

    public string? ParameterName { get; init; }

    public string? Label { get; init; }

    public CodedValue? ParamType { get; init; }

    public bool IsRequired { get; init; }

    public string? DefaultValue { get; init; }

    public int DisplayOrder { get; init; }

    public string? LookupTargetEntity { get; init; }
}

/// <summary>Report layout (qdb_reportlayout).</summary>
public sealed record ReportLayout
{
    public required Guid Id { get; init; }

    public CodedValue? LayoutType { get; init; }

    public string? ThemeColor { get; init; }

    public string? LayoutJson { get; init; }

    public string? HeaderJson { get; init; }

    public string? FooterJson { get; init; }

    public string? PageSettingsJson { get; init; }
}

/// <summary>
/// An option-set value: its numeric <see cref="Code"/> and the server's localized
/// <see cref="Label"/> (from the FormattedValue annotation). Either may be absent.
/// </summary>
public sealed record CodedValue(int? Code, string? Label);
