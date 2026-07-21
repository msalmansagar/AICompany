namespace Qdb.ReportEngine.Core.Models;

/// <summary>Runtime inputs for executing a report: prompt values and an optional row-limit override.</summary>
public sealed record ReportExecutionRequest
{
    /// <summary>Values for runtime-prompt filters and parameters, keyed by parameter name.</summary>
    public IReadOnlyDictionary<string, string?> ParameterValues { get; init; } =
        new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);

    /// <summary>Overrides the report's configured row limit when set.</summary>
    public int? RowLimitOverride { get; init; }
}

/// <summary>The tabular result of executing a report.</summary>
public sealed record ReportResult
{
    public required Guid ReportId { get; init; }

    public required string ReportName { get; init; }

    /// <summary>Output columns, in display order.</summary>
    public IReadOnlyList<ReportResultColumn> Columns { get; init; } = [];

    /// <summary>Result rows; each maps a column alias to its cell.</summary>
    public IReadOnlyList<ReportResultRow> Rows { get; init; } = [];

    /// <summary>Number of returned rows.</summary>
    public int RowCount { get; init; }

    /// <summary>True when the result was capped at the row limit and more rows may exist.</summary>
    public bool Truncated { get; init; }

    public TimeSpan Duration { get; init; }
}

/// <summary>A result column: its output alias, display label, source attribute, and type.</summary>
public sealed record ReportResultColumn
{
    public required string Alias { get; init; }

    public string? Label { get; init; }

    public string? Attribute { get; init; }

    public CodedValue? DataType { get; init; }

    public bool IsVisible { get; init; } = true;
}

/// <summary>One result row: cells keyed by column alias.</summary>
public sealed record ReportResultRow
{
    public required IReadOnlyDictionary<string, ReportCell> Cells { get; init; }
}

/// <summary>A single cell: the raw <see cref="Value"/> and its formatted display <see cref="Text"/>.</summary>
public sealed record ReportCell(object? Value, string? Text);
