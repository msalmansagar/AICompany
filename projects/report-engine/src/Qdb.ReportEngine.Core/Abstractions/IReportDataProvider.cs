using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Executes a single widget's aggregated query against CRM (Dataverse cloud or on-prem 9.x),
/// as the requesting user via the connection produced by <see cref="IDataverseConnectionFactory"/>.
/// A V1 component reused unchanged by the dashboard fan-out (ADR-RPT-008).
/// </summary>
public interface IReportDataProvider
{
    /// <summary>
    /// Resolves one widget's data points. Implementations honour the query strategy
    /// (FetchXML / QueryExpression / Web API) chosen for the widget's source.
    /// </summary>
    Task<Result<IReadOnlyList<DataPoint>>> QueryWidgetAsync(
        DashboardWidget widget,
        ReportExecutionContext context,
        CancellationToken cancellationToken);

    /// <summary>
    /// Resolves a group of same-entity widgets in a single round-trip (OData $batch on cloud,
    /// ExecuteMultiple on on-prem) — ADR-RPT-008 §3. Returns results keyed by widget id.
    /// </summary>
    Task<Result<IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>>>> QueryWidgetBatchAsync(
        IReadOnlyList<DashboardWidget> sameEntityWidgets,
        ReportExecutionContext context,
        CancellationToken cancellationToken);
}
