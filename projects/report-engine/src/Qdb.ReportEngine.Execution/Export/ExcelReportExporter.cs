using ClosedXML.Excel;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Export;

/// <summary>
/// Renders a report result to an .xlsx workbook via ClosedXML: a bold header row of column labels,
/// one row per result row, and an auto-fit adjusted column width.
/// </summary>
public sealed class ExcelReportExporter : IReportExporter
{
    private const string SpreadsheetContentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /// <inheritdoc />
    public ExportFormat Format => ExportFormat.Excel;

    /// <inheritdoc />
    public ExportedFile Export(ReportResult result)
    {
        ArgumentNullException.ThrowIfNull(result);

        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Report");
        WriteHeader(sheet, result);
        WriteRows(sheet, result);
        sheet.Columns().AdjustToContents();

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return new ExportedFile(stream.ToArray(), SpreadsheetContentType, ExportFileName.For(result.ReportName, "xlsx"));
    }

    private static void WriteHeader(IXLWorksheet sheet, ReportResult result)
    {
        for (var column = 0; column < result.Columns.Count; column++)
        {
            var cell = sheet.Cell(1, column + 1);
            cell.Value = result.Columns[column].Label ?? result.Columns[column].Alias;
            cell.Style.Font.Bold = true;
        }
    }

    private static void WriteRows(IXLWorksheet sheet, ReportResult result)
    {
        for (var rowIndex = 0; rowIndex < result.Rows.Count; rowIndex++)
        {
            var row = result.Rows[rowIndex];
            for (var column = 0; column < result.Columns.Count; column++)
            {
                var text = row.Cells.TryGetValue(result.Columns[column].Alias, out var cell) ? cell.Text : null;
                sheet.Cell(rowIndex + 2, column + 1).Value = text ?? string.Empty;
            }
        }
    }
}
