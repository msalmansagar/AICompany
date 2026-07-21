using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Executes a stored report: loads its definition, builds the FetchXML from its columns/filters/
/// parameters (<see cref="ReportQueryBuilder"/>), runs it as the requesting user, and shapes the
/// rows (<see cref="ReportRowShaper"/>). A drilldown runs the child query of a relationship filtered
/// to a parent key. Throttling propagates for the caller's retry policy; other failures return a
/// <see cref="Result{T}"/> failure.
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
        return await RunAsync(definition, query, context, definition.Formulas, definition.Transformations, cancellationToken)
            .ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<Result<ReportResult>> ExecuteDrilldownAsync(
        Guid reportId, Guid relationshipId, string parentKey, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(parentKey);
        ArgumentNullException.ThrowIfNull(context);

        var definitionResult = await definitionLoader.LoadAsync(reportId, context, cancellationToken).ConfigureAwait(false);
        if (!definitionResult.IsSuccess)
        {
            return Result<ReportResult>.Failure(definitionResult.Error!);
        }

        var childResult = DrilldownPlanner.BuildChildDefinition(definitionResult.Value, relationshipId, parentKey);
        if (!childResult.IsSuccess)
        {
            return Result<ReportResult>.Failure(childResult.Error!);
        }

        var childDefinition = childResult.Value;
        var query = ReportQueryBuilder.Build(childDefinition, new ReportExecutionRequest());
        return await RunAsync(childDefinition, query, context, [], [], cancellationToken).ConfigureAwait(false);
    }

    // Opens a per-user connection, runs the query, shapes rows, applies formulas, then transformations.
    private async Task<Result<ReportResult>> RunAsync(
        ReportDefinition definition,
        ReportQuery query,
        ReportExecutionContext context,
        IReadOnlyList<ReportFormula> formulas,
        IReadOnlyList<ReportTransformation> transformations,
        CancellationToken cancellationToken)
    {
        try
        {
            var stopwatch = Stopwatch.StartNew();
            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            var rawRows = await connection
                .RetrieveMultipleAsync(query.RootEntity, query.FetchXml, cancellationToken)
                .ConfigureAwait(false);

            var shaped = ReportRowShaper.Shape(query.Columns, rawRows);
            var rows = FormulaEvaluator.Apply(formulas, shaped);
            var columns = formulas.Count > 0
                ? query.Columns.Concat(FormulaEvaluator.Columns(formulas)).ToList()
                : query.Columns;

            var result = new ReportResult
            {
                ReportId = definition.Id,
                ReportName = definition.Name,
                Columns = columns,
                Rows = rows,
                RowCount = rows.Count,
                Truncated = !query.IsAggregate && rows.Count >= query.RowLimit,
                Duration = stopwatch.Elapsed
            };
            return Result<ReportResult>.Success(ReportTransformationPipeline.Apply(transformations, result));
        }
        catch (DataverseThrottledException)
        {
            throw; // let the caller's resilience policy honour Retry-After.
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to execute report {ReportId} (corr {CorrelationId})", definition.Id, context.CorrelationId);
            return Result<ReportResult>.Failure(DomainError.QueryFailed($"report {definition.Id}"));
        }
    }
}
