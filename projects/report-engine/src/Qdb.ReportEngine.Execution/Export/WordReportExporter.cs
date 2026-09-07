using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Export;

/// <summary>
/// Renders a report result to a .docx via the Open XML SDK: a title paragraph, then a bordered
/// table with a bold header row and one row per result row.
/// </summary>
public sealed class WordReportExporter : IReportExporter
{
    private const string WordContentType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    /// <inheritdoc />
    public ExportFormat Format => ExportFormat.Word;

    /// <inheritdoc />
    public ExportedFile Export(ReportResult result)
    {
        ArgumentNullException.ThrowIfNull(result);

        using var stream = new MemoryStream();
        using (var document = WordprocessingDocument.Create(stream, WordprocessingDocumentType.Document))
        {
            var main = document.AddMainDocumentPart();
            var body = new Body();
            main.Document = new Document(body);
            body.AppendChild(new Paragraph(new Run(Text(result.ReportName))));
            body.AppendChild(BuildTable(result));
            main.Document.Save();
        }

        return new ExportedFile(stream.ToArray(), WordContentType, ExportFileName.For(result.ReportName, "docx"));
    }

    private static Table BuildTable(ReportResult result)
    {
        var table = new Table(new TableProperties(SingleBorders()));
        table.AppendChild(HeaderRow(result));
        foreach (var row in result.Rows)
        {
            table.AppendChild(DataRow(result, row));
        }

        return table;
    }

    private static TableRow HeaderRow(ReportResult result)
    {
        var row = new TableRow();
        foreach (var column in result.Columns)
        {
            row.Append(Cell(column.Label ?? column.Alias, bold: true));
        }

        return row;
    }

    private static TableRow DataRow(ReportResult result, ReportResultRow row)
    {
        var tableRow = new TableRow();
        foreach (var column in result.Columns)
        {
            var text = row.Cells.TryGetValue(column.Alias, out var cell) ? cell.Text : null;
            tableRow.Append(Cell(text ?? string.Empty, bold: false));
        }

        return tableRow;
    }

    private static TableCell Cell(string text, bool bold)
    {
        var run = new Run(Text(text));
        if (bold)
        {
            run.RunProperties = new RunProperties(new Bold());
        }

        return new TableCell(new Paragraph(run));
    }

    private static Text Text(string value) => new(value) { Space = SpaceProcessingModeValues.Preserve };

    private static TableBorders SingleBorders() => new(
        new TopBorder { Val = BorderValues.Single, Size = 4U },
        new BottomBorder { Val = BorderValues.Single, Size = 4U },
        new LeftBorder { Val = BorderValues.Single, Size = 4U },
        new RightBorder { Val = BorderValues.Single, Size = 4U },
        new InsideHorizontalBorder { Val = BorderValues.Single, Size = 4U },
        new InsideVerticalBorder { Val = BorderValues.Single, Size = 4U });
}
