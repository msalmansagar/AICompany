namespace Qdb.ReportEngine.Core.Models;

/// <summary>
/// The persisted definition of a dashboard: an ordered set of sections, each holding
/// independently data-bound widgets. Mirrors the <c>qdb_dashboard*</c> schema tables.
/// </summary>
public sealed record DashboardDefinition
{
    public required Guid Id { get; init; }

    public required string Title { get; init; }

    /// <summary>Per-dashboard governance flag (DC-4 — configurable per dashboard; ungoverned by default).</summary>
    public bool IsGoverned { get; init; }

    public IReadOnlyList<DashboardSection> Sections { get; init; } = [];

    /// <summary>Flattened widget list across all sections, in render order.</summary>
    public IEnumerable<DashboardWidget> Widgets => Sections.SelectMany(s => s.Widgets);
}

/// <summary>A horizontal band with a fixed column count holding widgets.</summary>
public sealed record DashboardSection
{
    public required Guid Id { get; init; }

    public string? Title { get; init; }

    /// <summary>Column count 1–4.</summary>
    public int Columns { get; init; } = 4;

    /// <summary>Order of this section within the dashboard.</summary>
    public int Sequence { get; init; }

    public IReadOnlyList<DashboardWidget> Widgets { get; init; } = [];
}

/// <summary>
/// A single data-bound widget. Each widget binds to its own entity/query/aggregation —
/// this independence is the fan-out that ADR-RPT-008 governs.
/// </summary>
public sealed record DashboardWidget
{
    public required Guid Id { get; init; }

    public required WidgetKind Kind { get; init; }

    public required string Entity { get; init; }

    /// <summary>Grouping attribute logical name, or <c>null</c> for record-level widgets.</summary>
    public string? GroupByAttribute { get; init; }

    /// <summary>Measure attribute logical name, or <c>null</c> to count records.</summary>
    public string? MeasureAttribute { get; init; }

    public Aggregation Aggregation { get; init; } = Aggregation.Sum;

    /// <summary>Display title (does not affect the query).</summary>
    public string? Title { get; init; }

    /// <summary>Chart sub-type for chart widgets (donut/bar/…); a rendering hint only.</summary>
    public string? ChartType { get; init; }

    /// <summary>Order of this widget within its section.</summary>
    public int Sequence { get; init; }
}

/// <summary>A lightweight dashboard entry for the catalog.</summary>
public sealed record DashboardSummary
{
    public required Guid Id { get; init; }

    public required string Title { get; init; }

    public string? DashboardCode { get; init; }

    public string? Description { get; init; }

    public int WidgetCount { get; init; }

    public int SectionCount { get; init; }
}

/// <summary>The visual type a widget renders as (drives no query behaviour — data binding does).</summary>
public enum WidgetKind
{
    Metric, Gauge, Badge, Progress, Chart, InfoCards, Profile, Checklist, Matrix, Table
}

/// <summary>Aggregation applied to a widget's measure.</summary>
public enum Aggregation { Sum, Average, Count, Max, Min }
