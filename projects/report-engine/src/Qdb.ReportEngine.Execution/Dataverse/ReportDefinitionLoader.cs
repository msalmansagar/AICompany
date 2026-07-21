using Microsoft.Extensions.Logging;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Loads a report definition and its children from Dataverse into the runtime
/// <see cref="ReportDefinition"/> model. The definition is read first (so a missing report short-
/// circuits to <see cref="DomainError.NotFound"/>); the six child sets then load in a single
/// OData <c>$batch</c> round-trip and are assembled by <see cref="ReportDefinitionAssembler"/>.
/// </summary>
public sealed class ReportDefinitionLoader(
    IDataverseConnectionFactory connectionFactory,
    ILogger<ReportDefinitionLoader> logger) : IReportDefinitionLoader
{
    // Stable keys correlate each child query to its result in the batch response.
    private static readonly Guid DataSourcesKey = Guid.Parse("00000000-0000-0000-0000-0000000000d5");
    private static readonly Guid MappingsKey = Guid.Parse("00000000-0000-0000-0000-0000000000ee");
    private static readonly Guid ColumnsKey = Guid.Parse("00000000-0000-0000-0000-0000000000c0");
    private static readonly Guid FiltersKey = Guid.Parse("00000000-0000-0000-0000-0000000000f1");
    private static readonly Guid ParametersKey = Guid.Parse("00000000-0000-0000-0000-0000000000a2");
    private static readonly Guid LayoutsKey = Guid.Parse("00000000-0000-0000-0000-0000000000ab");

    /// <inheritdoc />
    public async Task<Result<ReportDefinition>> LoadAsync(Guid reportId, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);

        try
        {
            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);

            var definitionRows = await connection
                .RetrieveMultipleAsync("qdb_reportdefinition", ReportDefinitionFetch.Definition(reportId), cancellationToken)
                .ConfigureAwait(false);
            if (definitionRows.Count == 0)
            {
                return Result<ReportDefinition>.Failure(DomainError.NotFound($"Report {reportId}"));
            }

            var children = await connection
                .RetrieveMultipleBatchAsync(ChildQueries(reportId), cancellationToken)
                .ConfigureAwait(false);

            var rows = new RawReportRows
            {
                Definition = definitionRows[0],
                DataSources = children[DataSourcesKey],
                EntityMappings = children[MappingsKey],
                Columns = children[ColumnsKey],
                Filters = children[FiltersKey],
                Parameters = children[ParametersKey],
                Layouts = children[LayoutsKey]
            };

            return Result<ReportDefinition>.Success(ReportDefinitionAssembler.Assemble(rows));
        }
        catch (DataverseThrottledException)
        {
            throw; // let the caller's resilience policy retry.
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to load report {ReportId} (corr {CorrelationId})", reportId, context.CorrelationId);
            return Result<ReportDefinition>.Failure(DomainError.QueryFailed($"report {reportId}"));
        }
    }

    private static IReadOnlyList<BatchQuery> ChildQueries(Guid reportId) =>
    [
        new(DataSourcesKey, "qdb_reportdatasource", ReportDefinitionFetch.DataSources(reportId)),
        new(MappingsKey, "qdb_reportentitymapping", ReportDefinitionFetch.EntityMappings(reportId)),
        new(ColumnsKey, "qdb_reportcolumn", ReportDefinitionFetch.Columns(reportId)),
        new(FiltersKey, "qdb_reportfilter", ReportDefinitionFetch.Filters(reportId)),
        new(ParametersKey, "qdb_reportparameter", ReportDefinitionFetch.Parameters(reportId)),
        new(LayoutsKey, "qdb_reportlayout", ReportDefinitionFetch.Layouts(reportId))
    ];
}
