namespace Qdb.ReportEngine.Core.Models;

/// <summary>The role a dataset plays in its report's output (ADR-RPT-012 §1).</summary>
/// <remarks>
/// A <c>joined</c> dataset has no role here on purpose: joining merges it into the root's columns and
/// rows, so by the time a result exists it is no longer a dataset of its own. Only the root and the
/// standalone blocks reach the output.
/// </remarks>
public static class DatasetRole
{
    public const string Root = "root";

    public const string Standalone = "standalone";
}

/// <summary>Whether a dataset produced rows or failed (ADR-RPT-012 §5).</summary>
public static class DatasetStatus
{
    public const string Ok = "ok";

    /// <summary>
    /// The dataset did not return rows and the report says so. A failed dataset is rendered as a
    /// named failure block rather than an empty table: an empty table is indistinguishable from a
    /// query that legitimately matched nothing, which is the silent-ignore defect ADD-002 §2 exists
    /// to remove.
    /// </summary>
    public const string Failed = "failed";
}

/// <summary>
/// One result set within a report (ADD-002 MDS-FR-004). A report with a single dataset does not use
/// this type — it serialises as it always has, so nothing already deployed changes shape.
/// </summary>
public sealed record ReportDataset
{
    /// <summary>The declaring data source's id, so a block can be traced back to what configured it.</summary>
    public required string Id { get; init; }

    /// <summary>The author's name for this block, shown as its heading.</summary>
    public required string Name { get; init; }

    /// <summary>
    /// The dataset's source alias — the stable key layout-side authoring (totals, D3) addresses a
    /// dataset by. Names are display text and get renamed; the alias survives a rename.
    /// </summary>
    public string? Alias { get; init; }

    /// <summary>One of <see cref="DatasetRole"/>.</summary>
    public required string Role { get; init; }

    public IReadOnlyList<ReportResultColumn> Columns { get; init; } = [];

    public IReadOnlyList<ReportResultRow> Rows { get; init; } = [];

    public int RowCount { get; init; }

    /// <summary>True when this dataset alone hit its own row limit (MDS-FR-008).</summary>
    public bool Truncated { get; init; }

    /// <summary>
    /// This dataset's own execution time (MDS-FR-027), so a slow source is identifiable from the
    /// result rather than from a trace.
    /// </summary>
    public int ElapsedMs { get; init; }

    /// <summary>One of <see cref="DatasetStatus"/>.</summary>
    public string Status { get; init; } = DatasetStatus.Ok;

    /// <summary>Why this dataset failed; null when it did not.</summary>
    public string? Error { get; init; }
}
