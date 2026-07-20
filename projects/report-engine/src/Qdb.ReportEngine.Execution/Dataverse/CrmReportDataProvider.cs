using Microsoft.Extensions.Logging;
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
public sealed class CrmReportDataProvider(
    IDataverseConnectionFactory connectionFactory,
    ILogger<CrmReportDataProvider> logger) : IReportDataProvider
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<DataPoint>>> QueryWidgetAsync(
        DashboardWidget widget,
        ReportExecutionContext context,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(widget);
        await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);

        var fetchXml = FetchXmlAggregateBuilder.Build(widget);
        logger.LogDebug("Widget {WidgetId} FetchXML built for user {UserId}: {FetchXml}",
            widget.Id, connection.ExecutingUserId, fetchXml);

        // TODO(build): execute fetchXml via the connection (RetrieveMultiple) and map aggregate rows
        // ('group' / 'value' aliases) to DataPoint. Throw DataverseThrottledException on 429.
        return Result<IReadOnlyList<DataPoint>>.Failure(DomainError.NotImplemented("QueryWidgetAsync execution"));
    }

    /// <inheritdoc />
    public async Task<Result<IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>>>> QueryWidgetBatchAsync(
        IReadOnlyList<DashboardWidget> sameEntityWidgets,
        ReportExecutionContext context,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(sameEntityWidgets);
        await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);

        // Build each widget's FetchXML now (real); grouping into one $batch / ExecuteMultiple
        // round-trip and row mapping is the remaining build work.
        foreach (var widget in sameEntityWidgets)
        {
            logger.LogDebug("Batched widget {WidgetId}: {FetchXml}", widget.Id, FetchXmlAggregateBuilder.Build(widget));
        }

        // TODO(build): issue one OData $batch (cloud) / ExecuteMultiple ContinueOnError=true (on-prem)
        // over `connection` and map each response back to its widget id.
        return Result<IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>>>.Failure(
            DomainError.NotImplemented("QueryWidgetBatchAsync execution"));
    }
}
