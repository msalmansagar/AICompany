using Microsoft.Extensions.Logging;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Writes a composed dashboard to Dataverse as the requesting user: the dashboard record, then its
/// sections (bound to the dashboard), then each section's widgets (bound to the section). Enum-ish
/// values are stored as strings to match the loader.
/// </summary>
public sealed class DashboardWriter(
    IDataverseConnectionFactory connectionFactory,
    IDashboardDefinitionLoader loader,
    ILogger<DashboardWriter> logger) : IDashboardWriter
{
    /// <inheritdoc />
    public async Task<Result<Guid>> CreateAsync(DashboardDefinition definition, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(definition);
        ArgumentNullException.ThrowIfNull(context);

        try
        {
            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            var dashboardId = await connection.CreateAsync("qdb_dashboard", DashboardAttributes(definition), cancellationToken).ConfigureAwait(false);
            await CreateSectionsAsync(connection, dashboardId, definition, cancellationToken).ConfigureAwait(false);
            return Result<Guid>.Success(dashboardId);
        }
        catch (DataverseThrottledException)
        {
            throw;
        }
        catch (DataverseAccessDeniedException ex)
        {
            return Result<Guid>.Failure(DomainError.PermissionDenied(ex.Entity));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to save dashboard (corr {CorrelationId})", context.CorrelationId);
            return Result<Guid>.Failure(DomainError.QueryFailed("dashboard save"));
        }
    }

    /// <inheritdoc />
    public async Task<Result<Guid>> UpdateAsync(Guid dashboardId, DashboardDefinition definition, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(definition);
        ArgumentNullException.ThrowIfNull(context);

        try
        {
            var existing = await loader.LoadAsync(dashboardId, context, cancellationToken).ConfigureAwait(false);
            if (!existing.IsSuccess)
            {
                return Result<Guid>.Failure(existing.Error!);
            }

            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            await DeleteSectionsAsync(connection, existing.Value, cancellationToken).ConfigureAwait(false);
            await connection.UpdateAsync("qdb_dashboard", dashboardId, DashboardAttributes(definition), cancellationToken).ConfigureAwait(false);
            await CreateSectionsAsync(connection, dashboardId, definition, cancellationToken).ConfigureAwait(false);
            return Result<Guid>.Success(dashboardId);
        }
        catch (DataverseThrottledException)
        {
            throw;
        }
        catch (DataverseAccessDeniedException ex)
        {
            return Result<Guid>.Failure(DomainError.PermissionDenied(ex.Entity));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to update dashboard {DashboardId} (corr {CorrelationId})", dashboardId, context.CorrelationId);
            return Result<Guid>.Failure(DomainError.QueryFailed("dashboard update"));
        }
    }

    /// <inheritdoc />
    public async Task<Result<Guid>> DeleteAsync(Guid dashboardId, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);

        try
        {
            var existing = await loader.LoadAsync(dashboardId, context, cancellationToken).ConfigureAwait(false);
            if (!existing.IsSuccess)
            {
                return Result<Guid>.Failure(existing.Error!);
            }

            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            await DeleteSectionsAsync(connection, existing.Value, cancellationToken).ConfigureAwait(false);
            await connection.DeleteAsync("qdb_dashboard", dashboardId, cancellationToken).ConfigureAwait(false);
            return Result<Guid>.Success(dashboardId);
        }
        catch (DataverseThrottledException)
        {
            throw;
        }
        catch (DataverseAccessDeniedException ex)
        {
            return Result<Guid>.Failure(DomainError.PermissionDenied(ex.Entity));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to delete dashboard {DashboardId} (corr {CorrelationId})", dashboardId, context.CorrelationId);
            return Result<Guid>.Failure(DomainError.QueryFailed("dashboard delete"));
        }
    }

    private static Dictionary<string, object?> DashboardAttributes(DashboardDefinition definition) => new(StringComparer.Ordinal)
    {
        ["qdb_dashboardname"] = definition.Title,
        ["qdb_isgoverned"] = definition.IsGoverned
    };

    private static async Task CreateSectionsAsync(
        IDataverseConnection connection, Guid dashboardId, DashboardDefinition definition, CancellationToken cancellationToken)
    {
        var sectionSequence = 1;
        foreach (var section in definition.Sections)
        {
            await CreateSectionAsync(connection, dashboardId, section, sectionSequence++, cancellationToken).ConfigureAwait(false);
        }
    }

    // Widgets are deleted before their section so the delete succeeds regardless of whether the
    // section→widget relationship cascades.
    private static async Task DeleteSectionsAsync(
        IDataverseConnection connection, DashboardDefinition existing, CancellationToken cancellationToken)
    {
        foreach (var section in existing.Sections)
        {
            foreach (var widget in section.Widgets)
            {
                await connection.DeleteAsync("qdb_dashboardwidget", widget.Id, cancellationToken).ConfigureAwait(false);
            }

            await connection.DeleteAsync("qdb_dashboardsection", section.Id, cancellationToken).ConfigureAwait(false);
        }
    }

    private static async Task CreateSectionAsync(
        IDataverseConnection connection, Guid dashboardId, DashboardSection section, int sequence, CancellationToken cancellationToken)
    {
        var sectionId = await connection.CreateAsync("qdb_dashboardsection", new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["qdb_dashboardsectionname"] = section.Title ?? "Section",
            ["qdb_columns"] = Math.Clamp(section.Columns, 1, 4),
            ["qdb_sequence"] = sequence,
            ["qdb_DashboardId@odata.bind"] = $"/qdb_dashboards({dashboardId})"
        }, cancellationToken).ConfigureAwait(false);

        var widgetSequence = 1;
        foreach (var widget in section.Widgets)
        {
            await connection.CreateAsync("qdb_dashboardwidget", new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["qdb_dashboardwidgetname"] = widget.Title ?? widget.Kind.ToString(),
                ["qdb_kind"] = widget.Kind.ToString(),
                ["qdb_entity"] = widget.Entity,
                ["qdb_groupby"] = widget.GroupByAttribute,
                ["qdb_measure"] = widget.MeasureAttribute,
                ["qdb_aggregation"] = widget.Aggregation.ToString(),
                ["qdb_charttype"] = widget.ChartType,
                ["qdb_sequence"] = widgetSequence++,
                ["qdb_DashboardSectionId@odata.bind"] = $"/qdb_dashboardsections({sectionId})"
            }, cancellationToken).ConfigureAwait(false);
        }
    }
}
