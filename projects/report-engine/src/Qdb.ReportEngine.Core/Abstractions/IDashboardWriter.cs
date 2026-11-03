using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Persists a composed dashboard to Dataverse (qdb_dashboard → sections → widgets), as the
/// requesting user, so a dashboard designed in the browser can be saved and then loaded/run.
/// </summary>
public interface IDashboardWriter
{
    /// <summary>Creates a new dashboard from <paramref name="definition"/> and returns its new id.</summary>
    Task<Result<Guid>> CreateAsync(DashboardDefinition definition, ReportExecutionContext context, CancellationToken cancellationToken);

    /// <summary>
    /// Updates dashboard <paramref name="dashboardId"/> in place from <paramref name="definition"/>,
    /// replacing its sections and widgets. Returns the id on success.
    /// </summary>
    Task<Result<Guid>> UpdateAsync(Guid dashboardId, DashboardDefinition definition, ReportExecutionContext context, CancellationToken cancellationToken);

    /// <summary>Deletes dashboard <paramref name="dashboardId"/> and its sections and widgets.</summary>
    Task<Result<Guid>> DeleteAsync(Guid dashboardId, ReportExecutionContext context, CancellationToken cancellationToken);
}
