using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Export;

/// <summary>
/// Dispatches an export to the registered <see cref="IReportExporter"/> for the requested format.
/// New formats are added by registering another exporter — no change here.
/// </summary>
public sealed class ReportExportService : IReportExportService
{
    private readonly IReadOnlyDictionary<ExportFormat, IReportExporter> _exporters;

    /// <summary>Indexes the injected exporters by their format.</summary>
    public ReportExportService(IEnumerable<IReportExporter> exporters)
    {
        ArgumentNullException.ThrowIfNull(exporters);
        _exporters = exporters.ToDictionary(e => e.Format);
    }

    /// <inheritdoc />
    public Result<ExportedFile> Export(ReportResult result, ExportFormat format)
    {
        ArgumentNullException.ThrowIfNull(result);
        return _exporters.TryGetValue(format, out var exporter)
            ? Result<ExportedFile>.Success(exporter.Export(result))
            : Result<ExportedFile>.Failure(DomainError.UnsupportedFormat(format.ToString()));
    }
}
