using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Executes a stored report: loads its definition, builds the FetchXML from its columns/filters/
/// parameters (<see cref="ReportQueryBuilder"/>), runs it as the requesting user, and shapes the
/// rows (<see cref="ReportRowShaper"/>). Throttling propagates for the caller's retry policy; other
/// failures return a <see cref="Result{T}"/> failure.
/// </summary>
public sealed class ReportExecutor(
    IReportDefinitionLoader definitionLoader,
    IDataverseConnectionFactory connectionFactory,
    ILogger<ReportExecutor> logger) : IReportExecutor
{
    /// <inheritdoc />
    public async Task<Result<ReportResult>> ExecuteAsync(
        Guid reportId, ReportExecutionRequest request, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(context);

        var definitionResult = await definitionLoader.LoadAsync(reportId, context, cancellationToken).ConfigureAwait(false);
        if (!definitionResult.IsSuccess)
        {
            return Result<ReportResult>.Failure(definitionResult.Error!);
        }

        var definition = definitionResult.Value;
        var query = ReportQueryBuilder.Build(definition, request);

        try
        {
            var stopwatch = Stopwatch.StartNew();
            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            var rawRows = await connection
                .RetrieveMultipleAsync(query.RootEntity, query.FetchXml, cancellationToken)
                .ConfigureAwait(false);

            var rows = ReportRowShaper.Shape(query.Columns, rawRows);
            return Result<ReportResult>.Success(new ReportResult
            {
                ReportId = definition.Id,
                ReportName = definition.Name,
                Columns = query.Columns,
                Rows = rows,
                RowCount = rows.Count,
                Truncated = !query.IsAggregate && rows.Count >= query.RowLimit,
                Duration = stopwatch.Elapsed
            });
        }
        catch (DataverseThrottledException)
        {
            throw; // let the caller's resilience policy honour Retry-After.
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to execute report {ReportId} (corr {CorrelationId})", reportId, context.CorrelationId);
            return Result<ReportResult>.Failure(DomainError.QueryFailed($"report {reportId}"));
        }
    }
}
