using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Loads a stored report and its children (<c>qdb_reportdefinition</c> → data sources → entity
/// mappings → columns, plus filters, parameters, and layout) into the runtime
/// <see cref="ReportDefinition"/> model the query pipeline consumes.
/// </summary>
public interface IReportDefinitionLoader
{
    /// <summary>
    /// Loads the report with <paramref name="reportId"/>. Returns <see cref="DomainError.NotFound"/>
    /// when no such definition exists.
    /// </summary>
    Task<Result<ReportDefinition>> LoadAsync(Guid reportId, ReportExecutionContext context, CancellationToken cancellationToken);
}
