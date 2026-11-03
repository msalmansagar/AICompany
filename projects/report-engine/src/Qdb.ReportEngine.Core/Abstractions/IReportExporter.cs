using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Core.Abstractions;

/// <summary>Renders a <see cref="ReportResult"/> to one output format.</summary>
public interface IReportExporter
{
    /// <summary>The format this exporter produces.</summary>
    ExportFormat Format { get; }

    /// <summary>Renders <paramref name="result"/> to a file.</summary>
    ExportedFile Export(ReportResult result);
}

/// <summary>Selects the right <see cref="IReportExporter"/> for a requested format and runs it.</summary>
public interface IReportExportService
{
    /// <summary>
    /// Exports <paramref name="result"/> as <paramref name="format"/>, or a
    /// <see cref="DomainError"/> when no exporter is registered for it.
    /// </summary>
    Result<ExportedFile> Export(ReportResult result, ExportFormat format);
}

/// <summary>Renders a report result to a chart image.</summary>
public interface IReportChartService
{
    /// <summary>Renders <paramref name="result"/> as a chart per <paramref name="options"/>.</summary>
    Result<ExportedFile> Render(ReportResult result, ChartOptions options);
}
