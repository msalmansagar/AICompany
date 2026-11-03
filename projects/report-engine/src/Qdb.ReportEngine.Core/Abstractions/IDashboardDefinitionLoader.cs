using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Loads persisted dashboards (qdb_dashboard → sections → widgets) into the
/// <see cref="DashboardDefinition"/> model the fan-out executor consumes.
/// </summary>
public interface IDashboardDefinitionLoader
{
    /// <summary>Loads the dashboard with <paramref name="dashboardId"/>, or <see cref="DomainError.NotFound"/>.</summary>
    Task<Result<DashboardDefinition>> LoadAsync(Guid dashboardId, ReportExecutionContext context, CancellationToken cancellationToken);

    /// <summary>Lists the dashboards the user can see (the catalog).</summary>
    Task<Result<IReadOnlyList<DashboardSummary>>> ListAsync(ReportExecutionContext context, CancellationToken cancellationToken);
}
