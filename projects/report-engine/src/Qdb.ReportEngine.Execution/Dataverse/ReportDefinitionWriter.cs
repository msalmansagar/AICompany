using Microsoft.Extensions.Logging;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Writes a report definition to Dataverse as the requesting user, in dependency order: the
/// definition, then per data source its entity mappings and their columns, then the report-level
/// children (filters, parameters, layout, formulas, transformations, relationships). Children bind
/// to their parent's new id via <c>@odata.bind</c>.
/// </summary>
public sealed class ReportDefinitionWriter(
    IDataverseConnectionFactory connectionFactory,
    IReportDefinitionLoader loader,
    ILogger<ReportDefinitionWriter> logger) : IReportDefinitionWriter
{
    private const string DefinitionEntity = "qdb_reportdefinition";
    private const string DataSourceEntity = "qdb_reportdatasource";
    private const string EntityMappingEntity = "qdb_reportentitymapping";
    private const string ColumnEntity = "qdb_reportcolumn";
    private const string FilterEntity = "qdb_reportfilter";
    private const string ParameterEntity = "qdb_reportparameter";
    private const string LayoutEntity = "qdb_reportlayout";
    private const string FormulaEntity = "qdb_reportformula";
    private const string TransformationEntity = "qdb_reporttransformation";
    private const string RelationshipEntity = "qdb_reportrelationship";

    /// <inheritdoc />
    public async Task<Result<Guid>> CreateAsync(ReportDefinition definition, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(definition);
        ArgumentNullException.ThrowIfNull(context);

        try
        {
            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            var definitionId = await connection.CreateAsync(
                DefinitionEntity, ReportDefinitionAttributes.Definition(definition), cancellationToken).ConfigureAwait(false);

            await CreateDataSourcesAsync(connection, definitionId, definition.DataSources, cancellationToken).ConfigureAwait(false);
            await CreateReportChildrenAsync(connection, definitionId, definition, cancellationToken).ConfigureAwait(false);
            return Result<Guid>.Success(definitionId);
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
            logger.LogWarning(ex, "Failed to save report (corr {CorrelationId})", context.CorrelationId);
            return Result<Guid>.Failure(DomainError.QueryFailed("report save"));
        }
    }

    /// <inheritdoc />
    public async Task<Result<Guid>> UpdateAsync(Guid reportId, ReportDefinition definition, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(definition);
        ArgumentNullException.ThrowIfNull(context);

        try
        {
            var existing = await loader.LoadAsync(reportId, context, cancellationToken).ConfigureAwait(false);
            if (!existing.IsSuccess)
            {
                return Result<Guid>.Failure(existing.Error!);
            }

            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            await DeleteChildrenAsync(connection, existing.Value, cancellationToken).ConfigureAwait(false);
            await connection.UpdateAsync(DefinitionEntity, reportId, ReportDefinitionAttributes.Definition(definition), cancellationToken).ConfigureAwait(false);
            await CreateDataSourcesAsync(connection, reportId, definition.DataSources, cancellationToken).ConfigureAwait(false);
            await CreateReportChildrenAsync(connection, reportId, definition, cancellationToken).ConfigureAwait(false);
            return Result<Guid>.Success(reportId);
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
            logger.LogWarning(ex, "Failed to update report {ReportId} (corr {CorrelationId})", reportId, context.CorrelationId);
            return Result<Guid>.Failure(DomainError.QueryFailed("report update"));
        }
    }

    /// <inheritdoc />
    public async Task<Result<Guid>> DeleteAsync(Guid reportId, ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);

        try
        {
            var existing = await loader.LoadAsync(reportId, context, cancellationToken).ConfigureAwait(false);
            if (!existing.IsSuccess)
            {
                return Result<Guid>.Failure(existing.Error!);
            }

            await using var connection = await connectionFactory.CreateForUserAsync(context, cancellationToken).ConfigureAwait(false);
            await DeleteChildrenAsync(connection, existing.Value, cancellationToken).ConfigureAwait(false);
            await connection.DeleteAsync(DefinitionEntity, reportId, cancellationToken).ConfigureAwait(false);
            return Result<Guid>.Success(reportId);
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
            logger.LogWarning(ex, "Failed to delete report {ReportId} (corr {CorrelationId})", reportId, context.CorrelationId);
            return Result<Guid>.Failure(DomainError.QueryFailed("report delete"));
        }
    }

    // Deletes children leaf-first (columns → mappings → data sources) so the delete succeeds whether
    // or not the relationships cascade; then the report-level children.
    private static async Task DeleteChildrenAsync(IDataverseConnection connection, ReportDefinition existing, CancellationToken cancellationToken)
    {
        foreach (var dataSource in existing.DataSources)
        {
            foreach (var mapping in dataSource.EntityMappings)
            {
                foreach (var column in mapping.Columns)
                {
                    await connection.DeleteAsync(ColumnEntity, column.Id, cancellationToken).ConfigureAwait(false);
                }

                await connection.DeleteAsync(EntityMappingEntity, mapping.Id, cancellationToken).ConfigureAwait(false);
            }

            await connection.DeleteAsync(DataSourceEntity, dataSource.Id, cancellationToken).ConfigureAwait(false);
        }

        await DeleteReportLevelChildrenAsync(connection, existing, cancellationToken).ConfigureAwait(false);
    }

    private static async Task DeleteReportLevelChildrenAsync(IDataverseConnection connection, ReportDefinition existing, CancellationToken cancellationToken)
    {
        foreach (var filter in existing.Filters)
        {
            await connection.DeleteAsync(FilterEntity, filter.Id, cancellationToken).ConfigureAwait(false);
        }

        foreach (var parameter in existing.Parameters)
        {
            await connection.DeleteAsync(ParameterEntity, parameter.Id, cancellationToken).ConfigureAwait(false);
        }

        foreach (var formula in existing.Formulas)
        {
            await connection.DeleteAsync(FormulaEntity, formula.Id, cancellationToken).ConfigureAwait(false);
        }

        foreach (var transformation in existing.Transformations)
        {
            await connection.DeleteAsync(TransformationEntity, transformation.Id, cancellationToken).ConfigureAwait(false);
        }

        foreach (var relationship in existing.Relationships)
        {
            await connection.DeleteAsync(RelationshipEntity, relationship.Id, cancellationToken).ConfigureAwait(false);
        }

        if (existing.Layout is not null)
        {
            await connection.DeleteAsync(LayoutEntity, existing.Layout.Id, cancellationToken).ConfigureAwait(false);
        }
    }

    private static async Task CreateDataSourcesAsync(
        IDataverseConnection connection, Guid definitionId, IReadOnlyList<ReportDataSource> dataSources, CancellationToken cancellationToken)
    {
        var order = 1;
        foreach (var dataSource in dataSources)
        {
            var dataSourceId = await connection.CreateAsync(
                DataSourceEntity, ReportDefinitionAttributes.DataSource(definitionId, dataSource, order++), cancellationToken).ConfigureAwait(false);
            await CreateEntityMappingsAsync(connection, dataSourceId, dataSource.EntityMappings, cancellationToken).ConfigureAwait(false);
        }
    }

    private static async Task CreateEntityMappingsAsync(
        IDataverseConnection connection, Guid dataSourceId, IReadOnlyList<ReportEntityMapping> mappings, CancellationToken cancellationToken)
    {
        foreach (var mapping in mappings)
        {
            var mappingId = await connection.CreateAsync(
                EntityMappingEntity, ReportDefinitionAttributes.EntityMapping(dataSourceId, mapping), cancellationToken).ConfigureAwait(false);
            foreach (var column in mapping.Columns)
            {
                await connection.CreateAsync(
                    ColumnEntity, ReportDefinitionAttributes.Column(mappingId, column), cancellationToken).ConfigureAwait(false);
            }
        }
    }

    private static async Task CreateReportChildrenAsync(
        IDataverseConnection connection, Guid definitionId, ReportDefinition definition, CancellationToken cancellationToken)
    {
        foreach (var filter in definition.Filters)
        {
            await connection.CreateAsync(FilterEntity, ReportDefinitionAttributes.Filter(definitionId, filter), cancellationToken).ConfigureAwait(false);
        }

        foreach (var parameter in definition.Parameters)
        {
            await connection.CreateAsync(ParameterEntity, ReportDefinitionAttributes.Parameter(definitionId, parameter), cancellationToken).ConfigureAwait(false);
        }

        foreach (var formula in definition.Formulas)
        {
            await connection.CreateAsync(FormulaEntity, ReportDefinitionAttributes.Formula(definitionId, formula), cancellationToken).ConfigureAwait(false);
        }

        foreach (var transformation in definition.Transformations)
        {
            await connection.CreateAsync(TransformationEntity, ReportDefinitionAttributes.Transformation(definitionId, transformation), cancellationToken).ConfigureAwait(false);
        }

        foreach (var relationship in definition.Relationships)
        {
            await connection.CreateAsync(RelationshipEntity, ReportDefinitionAttributes.Relationship(definitionId, relationship), cancellationToken).ConfigureAwait(false);
        }

        if (definition.Layout is not null)
        {
            await connection.CreateAsync(LayoutEntity, ReportDefinitionAttributes.Layout(definitionId, definition.Layout), cancellationToken).ConfigureAwait(false);
        }
    }
}
