using Microsoft.Extensions.Options;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Configuration;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dashboards;

/// <summary>
/// Groups widgets by entity so same-entity queries can be batched (ADR-RPT-008 §3).
/// When grouping is disabled, every widget is its own group.
/// </summary>
public sealed class WidgetQueryPlanner(IOptions<DashboardOptions> options) : IWidgetQueryPlanner
{
    private readonly bool _group = options.Value.GroupSameEntityQueries;

    /// <inheritdoc />
    public IReadOnlyList<WidgetQueryGroup> Plan(DashboardDefinition dashboard)
    {
        ArgumentNullException.ThrowIfNull(dashboard);

        if (!_group)
        {
            return dashboard.Widgets
                .Select(w => new WidgetQueryGroup(w.Entity, [w]))
                .ToList();
        }

        return dashboard.Widgets
            .GroupBy(w => w.Entity, StringComparer.OrdinalIgnoreCase)
            .Select(g => new WidgetQueryGroup(g.Key, g.ToList()))
            .ToList();
    }
}
