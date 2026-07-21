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

    /// <summary>The report's layout, if one is configured.</summary>
    public ReportLayout? Layout { get; init; }
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

    public IReadOnlyList<ReportEntityMapping> EntityMappings { get; init; } = [];
}

/// <summary>An entity mapped inside a data source (qdb_reportentitymapping) and its columns.</summary>
public sealed record ReportEntityMapping
{
    public required Guid Id { get; init; }

    public string? EntityLogicalName { get; init; }

    public string? EntityAlias { get; init; }

    public int Depth { get; init; }

    public CodedValue? JoinType { get; init; }

    public IReadOnlyList<ReportColumn> Columns { get; init; } = [];
}

/// <summary>A projected column (qdb_reportcolumn).</summary>
public sealed record ReportColumn
{
    public required Guid Id { get; init; }

    public string? ColumnLogicalName { get; init; }

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
