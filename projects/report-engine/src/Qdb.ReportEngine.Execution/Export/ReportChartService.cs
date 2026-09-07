using System.Globalization;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;
using ScottPlot;

namespace Qdb.ReportEngine.Execution.Export;

/// <summary>
/// Renders a report result to a chart PNG with ScottPlot (server-side, headless). The category
/// column supplies bar/point labels and the value column the numbers; both are inferred when not
/// specified. Supports column, bar (horizontal), line, and pie.
/// </summary>
public sealed class ReportChartService : IReportChartService
{
    /// <inheritdoc />
    public Result<ExportedFile> Render(ReportResult result, ChartOptions options)
    {
        ArgumentNullException.ThrowIfNull(result);
        ArgumentNullException.ThrowIfNull(options);

        var categoryAlias = options.CategoryAlias ?? result.Columns.FirstOrDefault()?.Alias;
        var valueAlias = options.ValueAlias ?? FirstNumericColumn(result);
        if (valueAlias is null)
        {
            return Result<ExportedFile>.Failure(DomainError.Invalid("No numeric column available to chart."));
        }

        var labels = result.Rows.Select(r => CellText(r, categoryAlias)).ToArray();
        var values = result.Rows.Select(r => CellNumber(r, valueAlias)).ToArray();
        var positions = Enumerable.Range(0, values.Length).Select(i => (double)i).ToArray();

        var plot = new Plot();
        plot.Title(result.ReportName);
        Draw(plot, options.ChartType.ToLowerInvariant(), values, positions, labels);

        var png = plot.GetImageBytes(options.Width, options.Height, ImageFormat.Png);
        return Result<ExportedFile>.Success(new ExportedFile(png, "image/png", ExportFileName.For(result.ReportName + "-chart", "png")));
    }

    private static void Draw(Plot plot, string chartType, double[] values, double[] positions, string[] labels)
    {
        switch (chartType)
        {
            case "pie":
                plot.Add.Pie(values);
                plot.ShowLegend();
                break;
            case "line":
                plot.Add.Scatter(positions, values);
                plot.Axes.Bottom.SetTicks(positions, labels);
                break;
            case "bar":
                var horizontal = plot.Add.Bars(values);
                horizontal.Horizontal = true;
                plot.Axes.Left.SetTicks(positions, labels);
                break;
            default: // "column"
                plot.Add.Bars(values);
                plot.Axes.Bottom.SetTicks(positions, labels);
                break;
        }
    }

    private static string? FirstNumericColumn(ReportResult result)
    {
        foreach (var column in result.Columns)
        {
            var sample = result.Rows
                .Select(r => r.Cells.TryGetValue(column.Alias, out var cell) ? cell : null)
                .FirstOrDefault(c => c is not null && !string.IsNullOrEmpty(c.Text));
            if (sample is not null && TryNumber(sample, out _))
            {
                return column.Alias;
            }
        }

        return null;
    }

    private static string CellText(ReportResultRow row, string? alias) =>
        alias is not null && row.Cells.TryGetValue(alias, out var cell) ? cell.Text ?? string.Empty : string.Empty;

    private static double CellNumber(ReportResultRow row, string alias) =>
        row.Cells.TryGetValue(alias, out var cell) && TryNumber(cell, out var value) ? value : 0d;

    private static bool TryNumber(ReportCell cell, out double value)
    {
        switch (cell.Value)
        {
            case double d: value = d; return true;
            case decimal m: value = (double)m; return true;
            case long l: value = l; return true;
            case int i: value = i; return true;
        }

        return double.TryParse(cell.Value?.ToString() ?? cell.Text, NumberStyles.Any, CultureInfo.InvariantCulture, out value);
    }
}
