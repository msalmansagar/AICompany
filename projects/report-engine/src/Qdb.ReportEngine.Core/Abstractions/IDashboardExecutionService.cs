using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Executes a dashboard's widgets under the fan-out concurrency model of ADR-RPT-008.
/// The streaming overload lets the client render progressively as widgets resolve.
/// </summary>
public interface IDashboardExecutionService
{
    /// <summary>
    /// Executes every widget in <paramref name="dashboard"/> and streams each
    /// <see cref="WidgetResult"/> as soon as it resolves (ADR-RPT-008 §5, staged load).
    /// </summary>
    IAsyncEnumerable<WidgetResult> ExecuteStreamAsync(
        DashboardDefinition dashboard,
        ReportExecutionContext context,
        CancellationToken cancellationToken);

    /// <summary>
    /// Executes every widget and awaits all results. Convenience wrapper over
    /// <see cref="ExecuteStreamAsync"/> for callers that do not stream.
    /// </summary>
    Task<DashboardResult> ExecuteAsync(
        DashboardDefinition dashboard,
        ReportExecutionContext context,
        CancellationToken cancellationToken);
}
