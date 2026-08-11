using Microsoft.Extensions.Logging;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Executes widget queries against CRM as the requesting user via a per-user connection from
/// <see cref="IDataverseConnectionFactory"/>. Same-entity widgets go through one OData <c>$batch</c>
/// round-trip (ADR-RPT-008 §3). Throttling (HTTP 429) propagates as
/// <see cref="DataverseThrottledException"/> so the resilience policy retries; every other failure
/// becomes a <see cref="Result{T}"/> failure so one widget's error does not abort the dashboard.
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
        ArgumentNullException.ThrowIfNull(context);

        try
        {
            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            var fetchXml = FetchXmlAggregateBuilder.Build(widget);
            var rows = await connection.RetrieveMultipleAsync(widget.Entity, fetchXml, cancellationToken).ConfigureAwait(false);
            return Result<IReadOnlyList<DataPoint>>.Success(FetchXmlResultMapper.Map(rows, UngroupedLabel(widget)));
        }
        catch (DataverseThrottledException)
        {
            throw; // let the resilience policy honour Retry-After and retry.
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Widget {WidgetId} query failed (corr {CorrelationId})", widget.Id, context.CorrelationId);
            return Result<IReadOnlyList<DataPoint>>.Failure(DomainError.QueryFailed(widget.Entity));
        }
    }

    /// <inheritdoc />
    public async Task<Result<IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>>>> QueryWidgetBatchAsync(
        IReadOnlyList<DashboardWidget> sameEntityWidgets,
        ReportExecutionContext context,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(sameEntityWidgets);
        ArgumentNullException.ThrowIfNull(context);

        try
        {
            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            var queries = sameEntityWidgets
                .Select(w => new BatchQuery(w.Id, w.Entity, FetchXmlAggregateBuilder.Build(w)))
                .ToList();

            var rawByWidget = await connection.RetrieveMultipleBatchAsync(queries, cancellationToken).ConfigureAwait(false);
            var mapped = MapBatch(sameEntityWidgets, rawByWidget);
            return Result<IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>>>.Success(mapped);
        }
        catch (DataverseThrottledException)
        {
            throw; // let the resilience policy honour Retry-After and retry.
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            var entity = sameEntityWidgets.Count > 0 ? sameEntityWidgets[0].Entity : "(unknown)";
            logger.LogWarning(ex, "Batch query for {Entity} failed (corr {CorrelationId})", entity, context.CorrelationId);
            return Result<IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>>>.Failure(DomainError.QueryFailed(entity));
        }
    }

    private static IReadOnlyDictionary<Guid, IReadOnlyList<DataPoint>> MapBatch(
        IReadOnlyList<DashboardWidget> widgets,
        IReadOnlyDictionary<Guid, IReadOnlyList<IReadOnlyDictionary<string, object?>>> rawByWidget)
    {
        var mapped = new Dictionary<Guid, IReadOnlyList<DataPoint>>(widgets.Count);
        foreach (var widget in widgets)
        {
            var rows = rawByWidget.TryGetValue(widget.Id, out var r) ? r : [];
            mapped[widget.Id] = FetchXmlResultMapper.Map(rows, UngroupedLabel(widget));
        }

        return mapped;
    }

    private static string UngroupedLabel(DashboardWidget widget) =>
        widget.MeasureAttribute ?? (string.IsNullOrEmpty(widget.GroupByAttribute) ? "Total" : widget.GroupByAttribute);
}
