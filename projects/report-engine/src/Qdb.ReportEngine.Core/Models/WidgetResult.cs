using Qdb.ReportEngine.Core.Common;

namespace Qdb.ReportEngine.Core.Models;

/// <summary>The resolved data for one widget, ready for the client to render.</summary>
public sealed record WidgetResult
{
    public required Guid WidgetId { get; init; }

    /// <summary>Aggregated data points (label + value), already grouped and aggregated server-side.</summary>
    public IReadOnlyList<DataPoint> Data { get; init; } = [];

    /// <summary>True when this widget's data was served from cache (ADR-RPT-007).</summary>
    public bool FromCache { get; init; }

    /// <summary>Server-side time to resolve this widget (for SLA telemetry vs <c>PerWidgetSla</c>).</summary>
    public TimeSpan Duration { get; init; }

    /// <summary>
    /// Set when the requesting user has no read access to the widget's entity — the client
    /// renders a "no access" indicator rather than empty rows (AUTH-C-8).
    /// </summary>
    public bool AccessDenied { get; init; }

    /// <summary>Populated when the widget failed to resolve (throttle, timeout, etc.).</summary>
    public DomainError? Error { get; init; }
}

/// <summary>A single label/value pair in a widget's result set.</summary>
public sealed record DataPoint(string Label, decimal Value);

/// <summary>The complete result of a dashboard execution — all widgets, resolved.</summary>
public sealed record DashboardResult
{
    public required Guid DashboardId { get; init; }

    public IReadOnlyList<WidgetResult> Widgets { get; init; } = [];

    public TimeSpan TotalDuration { get; init; }
}
