using Microsoft.Extensions.Logging;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Loads persisted dashboards and their sections/widgets from Dataverse into the
/// <see cref="DashboardDefinition"/> model. Runs as the requesting user (impersonation), so the
/// catalog and a load only surface dashboards the user can read.
/// </summary>
public sealed class DashboardDefinitionLoader(
    IDataverseConnectionFactory connectionFactory,
    ILogger<DashboardDefinitionLoader> logger) : IDashboardDefinitionLoader
{
    private static readonly Guid SectionsKey = Guid.Parse("00000000-0000-0000-0000-0000000000f1");
    private static readonly Guid WidgetsKey = Guid.Parse("00000000-0000-0000-0000-0000000000f2");

    /// <inheritdoc />
    public async Task<Result<DashboardDefinition>> LoadAsync(Guid dashboardId, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);

        try
        {
            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            var dashboardRows = await connection
                .RetrieveMultipleAsync("qdb_dashboard", DashboardDefinitionFetch.Dashboard(dashboardId), cancellationToken)
                .ConfigureAwait(false);
            if (dashboardRows.Count == 0)
            {
                return Result<DashboardDefinition>.Failure(DomainError.NotFound($"Dashboard {dashboardId}"));
            }

            var children = await connection.RetrieveMultipleBatchAsync(
            [
                new BatchQuery(SectionsKey, "qdb_dashboardsection", DashboardDefinitionFetch.Sections(dashboardId)),
                new BatchQuery(WidgetsKey, "qdb_dashboardwidget", DashboardDefinitionFetch.Widgets(dashboardId))
            ], cancellationToken).ConfigureAwait(false);

            return Result<DashboardDefinition>.Success(Assemble(dashboardRows[0], children[SectionsKey], children[WidgetsKey]));
        }
        catch (DataverseThrottledException)
        {
            throw;
        }
        catch (DataverseAccessDeniedException ex)
        {
            return Result<DashboardDefinition>.Failure(DomainError.PermissionDenied(ex.Entity));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to load dashboard {DashboardId} (corr {CorrelationId})", dashboardId, context.CorrelationId);
            return Result<DashboardDefinition>.Failure(DomainError.QueryFailed($"dashboard {dashboardId}"));
        }
    }

    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<DashboardSummary>>> ListAsync(ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);

        try
        {
            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            var rows = await connection
                .RetrieveMultipleAsync("qdb_dashboard", DashboardDefinitionFetch.List(), cancellationToken)
                .ConfigureAwait(false);
            var summaries = rows.Select(r => new DashboardSummary
            {
                Id = RowReader.Guid(r, "qdb_dashboardid") ?? Guid.Empty,
                Title = RowReader.String(r, "qdb_dashboardname") ?? string.Empty,
                DashboardCode = RowReader.String(r, "qdb_dashboardcode"),
                Description = RowReader.String(r, "qdb_description")
            }).ToList();
            return Result<IReadOnlyList<DashboardSummary>>.Success(summaries);
        }
        catch (DataverseThrottledException)
        {
            throw;
        }
        catch (DataverseAccessDeniedException ex)
        {
            return Result<IReadOnlyList<DashboardSummary>>.Failure(DomainError.PermissionDenied(ex.Entity));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to list dashboards (corr {CorrelationId})", context.CorrelationId);
            return Result<IReadOnlyList<DashboardSummary>>.Failure(DomainError.QueryFailed("dashboard list"));
        }
    }

    private static DashboardDefinition Assemble(
        IReadOnlyDictionary<string, object?> dashboard,
        IReadOnlyList<IReadOnlyDictionary<string, object?>> sectionRows,
        IReadOnlyList<IReadOnlyDictionary<string, object?>> widgetRows)
    {
        var widgetsBySection = widgetRows
            .GroupBy(w => RowReader.Guid(w, "qdb_dashboardsectionid"))
            .Where(g => g.Key is not null)
            .ToDictionary(g => g.Key!.Value, g => g.Select(MapWidget).OrderBy(w => w.Sequence).ToList());

        var sections = sectionRows.Select(s =>
        {
            var id = RowReader.Guid(s, "qdb_dashboardsectionid") ?? Guid.Empty;
            return new DashboardSection
            {
                Id = id,
                Title = RowReader.String(s, "qdb_dashboardsectionname"),
                Columns = Math.Clamp(RowReader.IntOrZero(s, "qdb_columns") is var c and > 0 ? c : 3, 1, 4),
                Sequence = RowReader.IntOrZero(s, "qdb_sequence"),
                Widgets = widgetsBySection.TryGetValue(id, out var w) ? w : []
            };
        }).OrderBy(s => s.Sequence).ToList();

        return new DashboardDefinition
        {
            Id = RowReader.Guid(dashboard, "qdb_dashboardid") ?? Guid.Empty,
            Title = RowReader.String(dashboard, "qdb_dashboardname") ?? string.Empty,
            IsGoverned = RowReader.Bool(dashboard, "qdb_isgoverned"),
            Sections = sections
        };
    }

    private static DashboardWidget MapWidget(IReadOnlyDictionary<string, object?> row) => new()
    {
        Id = RowReader.Guid(row, "qdb_dashboardwidgetid") ?? Guid.Empty,
        Kind = Enum.TryParse<WidgetKind>(RowReader.String(row, "qdb_kind"), true, out var kind) ? kind : WidgetKind.Metric,
        Entity = RowReader.String(row, "qdb_entity") ?? string.Empty,
        GroupByAttribute = RowReader.String(row, "qdb_groupby"),
        MeasureAttribute = RowReader.String(row, "qdb_measure"),
        Aggregation = Enum.TryParse<Aggregation>(RowReader.String(row, "qdb_aggregation"), true, out var agg) ? agg : Aggregation.Count,
        Title = RowReader.String(row, "qdb_dashboardwidgetname"),
        ChartType = RowReader.String(row, "qdb_charttype"),
        Sequence = RowReader.IntOrZero(row, "qdb_sequence")
    };
}
