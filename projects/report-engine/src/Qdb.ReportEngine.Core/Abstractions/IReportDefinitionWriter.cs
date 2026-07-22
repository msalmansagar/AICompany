using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>
/// Persists a <see cref="ReportDefinition"/> to Dataverse (qdb_reportdefinition and its data
/// sources, entity mappings, columns, filters, parameters, layout, formulas, transformations, and
/// relationships), as the requesting user — the write counterpart of
/// <see cref="IReportDefinitionLoader"/>, so a report designed in the browser can be saved and run.
/// </summary>
public interface IReportDefinitionWriter
{
    /// <summary>Creates a new report from <paramref name="definition"/> and returns its new id.</summary>
    Task<Result<Guid>> CreateAsync(ReportDefinition definition, ReportExecutionContext context, CancellationToken cancellationToken);
}
