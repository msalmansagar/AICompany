using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Executes widget queries against CRM as the requesting user. Skeleton — returns
/// <see cref="DomainError.NotImplemented"/>; the build wires FetchXML/QueryExpression/Web-API
/// execution over a per-user connection from <see cref="IDataverseConnectionFactory"/>, and the
/// batched path over OData <c>$batch</c> (cloud) / <c>ExecuteMultiple</c> (on-prem).
/// </summary>
public sealed class CrmReportDataProvider(IDataverseConnectionFactory connectionFactory) : IReportDataProvider
{
    private readonly IDataverseConnectionFactory _connectionFactory = connectionFactory;

    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<DataPoint>>> QueryWidgetAsync(
        DashboardWidget widget,
        ReportExecutionContext context,
        CancellationToken cancellationToken)
    {
        await using var _ = await _connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);

        // TODO(build): build the aggregate query for widget.GroupByAttribute / MeasureAttribute /
        // Aggregation and execute it via the connection; map rows to DataPoint.
        return Result<IReadOnlyList<DataPoint>>.Failure(DomainError.NotImplemented("QueryWidgetAsync"));
    }

    /// <inheritdoc />
    public async Task<Result<IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>>>> QueryWidgetBatchAsync(
        IReadOnlyList<DashboardWidget> sameEntityWidgets,
        ReportExecutionContext context,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(sameEntityWidgets);
        await using var _ = await _connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);

        // TODO(build): group the widgets into a single $batch / ExecuteMultiple (ContinueOnError=true)
        // and map each response back to its widget id.
        return Result<IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>>>.Failure(
            DomainError.NotImplemented("QueryWidgetBatchAsync"));
    }
}
