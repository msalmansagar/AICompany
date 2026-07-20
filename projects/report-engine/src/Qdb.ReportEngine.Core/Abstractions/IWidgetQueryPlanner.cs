using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Groups a dashboard's widgets into execution groups so that same-entity widgets can be
/// resolved in a single $batch / ExecuteMultiple round-trip (ADR-RPT-008 §3).
/// </summary>
public interface IWidgetQueryPlanner
{
    /// <summary>
    /// Produces the execution plan for <paramref name="dashboard"/>: one group per entity
    /// when grouping is enabled, otherwise one group per widget.
    /// </summary>
    IReadOnlyList<WidgetQueryGroup> Plan(DashboardDefinition dashboard);
}

/// <summary>A set of widgets that share an entity and are resolved together.</summary>
public sealed record WidgetQueryGroup(string Entity, IReadOnlyList<DashboardWidget> Widgets);
