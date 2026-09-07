using MigraDoc.DocumentObjectModel;
using MigraDoc.DocumentObjectModel.Tables;
using MigraDoc.Rendering;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Export;

/// <summary>
/// Renders a report result to PDF with PDFsharp/MigraDoc (MIT — ADR-RPT-009): a title, then a
/// bordered landscape table with a shaded bold header row. Columns share the usable page width.
/// </summary>
public sealed class PdfReportExporter : IReportExporter
{
    private const double UsableWidthCm = 24.0; // A4 landscape minus default margins.

    /// <inheritdoc />
    public ExportFormat Format => ExportFormat.Pdf;

    /// <inheritdoc />
    public ExportedFile Export(ReportResult result)
    {
        ArgumentNullException.ThrowIfNull(result);
        SystemFontResolver.EnsureRegistered();

        var document = new Document();
        var section = document.AddSection();
        section.PageSetup.PageFormat = PageFormat.A4;
        section.PageSetup.Orientation = Orientation.Landscape;

        var title = section.AddParagraph(result.ReportName);
        title.Format.Font.Bold = true;
        title.Format.Font.Size = 14;
        title.Format.SpaceAfter = Unit.FromCentimeter(0.4);

        BuildTable(section, result);

        var renderer = new PdfDocumentRenderer { Document = document };
        renderer.RenderDocument();

        using var stream = new MemoryStream();
        renderer.PdfDocument.Save(stream, false);
        return new ExportedFile(stream.ToArray(), "application/pdf", ExportFileName.For(result.ReportName, "pdf"));
    }

    private static void BuildTable(Section section, ReportResult result)
    {
        var table = section.AddTable();
        table.Borders.Width = 0.5;

        var columnCount = Math.Max(result.Columns.Count, 1);
        var columnWidth = Unit.FromCentimeter(UsableWidthCm / columnCount);
        foreach (var _ in result.Columns)
        {
            table.AddColumn(columnWidth);
        }

        AddHeaderRow(table, result);
        foreach (var row in result.Rows)
        {
            AddDataRow(table, result, row);
        }
    }

    private static void AddHeaderRow(Table table, ReportResult result)
    {
        var header = table.AddRow();
        header.Format.Font.Bold = true;
        header.Shading.Color = Colors.LightGray;
        for (var column = 0; column < result.Columns.Count; column++)
        {
            header.Cells[column].AddParagraph(result.Columns[column].Label ?? result.Columns[column].Alias);
        }
    }

    private static void AddDataRow(Table table, ReportResult result, ReportResultRow row)
    {
        var tableRow = table.AddRow();
        for (var column = 0; column < result.Columns.Count; column++)
        {
            var text = row.Cells.TryGetValue(result.Columns[column].Alias, out var cell) ? cell.Text : null;
            tableRow.Cells[column].AddParagraph(text ?? string.Empty);
        }
    }
}
