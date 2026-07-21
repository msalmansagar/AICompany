using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Executes a stored report: loads its definition, builds and runs the query from its columns,
/// filters, and parameters, and returns the shaped tabular <see cref="ReportResult"/>.
/// </summary>
public interface IReportExecutor
{
    /// <summary>
    /// Executes the report with <paramref name="reportId"/> under <paramref name="request"/>.
    /// Returns <see cref="DomainError.NotFound"/> when the report does not exist.
    /// </summary>
    Task<Result<ReportResult>> ExecuteAsync(
        Guid reportId, ReportExecutionRequest request, ReportExecutionContext context, CancellationToken cancellationToken);

    /// <summary>
    /// Drills down through a relationship: runs the related (child) entity's query filtered to the
    /// given parent key. Returns <see cref="DomainError.NotFound"/> when the report or relationship
    /// does not exist.
    /// </summary>
    Task<Result<ReportResult>> ExecuteDrilldownAsync(
        Guid reportId, Guid relationshipId, string parentKey, ReportExecutionContext context, CancellationToken cancellationToken);
}
