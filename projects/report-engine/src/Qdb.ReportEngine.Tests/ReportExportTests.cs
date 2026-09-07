using System.Text;
using ClosedXML.Excel;
using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Export;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class ReportExportTests
{
    [Fact]
    public void Csv_WritesHeaderAndRows_WithRfc4180Escaping()
    {
        var file = new CsvReportExporter().Export(Sample());

        Assert.Equal("text/csv", file.ContentType);
        Assert.Equal("Active-Accounts.csv", file.FileName);
        var text = Encoding.UTF8.GetString(file.Content).TrimStart('﻿');
        var lines = text.Replace("\r\n", "\n").Trim('\n').Split('\n');
        Assert.Equal("Name,Phone", lines[0]);
        Assert.Equal("\"Doha, Inc\",\"555\"\"6\"", lines[1]); // comma and embedded quote both escaped
        Assert.Equal("Acme,", lines[2]);                      // null cell -> empty field
    }

    [Fact]
    public void Excel_ProducesReadableWorkbookWithHeaderAndCells()
    {
        var file = new ExcelReportExporter().Export(Sample());

        Assert.Equal("Active-Accounts.xlsx", file.FileName);
        using var workbook = new XLWorkbook(new MemoryStream(file.Content));
        var sheet = workbook.Worksheet(1);
        Assert.Equal("Name", sheet.Cell(1, 1).GetString());
        Assert.Equal("Phone", sheet.Cell(1, 2).GetString());
        Assert.Equal("Doha, Inc", sheet.Cell(2, 1).GetString());
        Assert.Equal("Acme", sheet.Cell(3, 1).GetString());
    }

    [Fact]
    public void Word_ProducesReadableDocxWithHeaderAndCells()
    {
        var file = new WordReportExporter().Export(Sample());

        Assert.Equal("Active-Accounts.docx", file.FileName);
        using var document = DocumentFormat.OpenXml.Packaging.WordprocessingDocument.Open(new MemoryStream(file.Content), false);
        var texts = document.MainDocumentPart!.Document.Body!
            .Descendants<DocumentFormat.OpenXml.Wordprocessing.Text>()
            .Select(t => t.Text)
            .ToList();
        Assert.Contains("Name", texts);
        Assert.Contains("Doha, Inc", texts);
        Assert.Contains("Acme", texts);
    }

    [Fact]
    public void Pdf_ProducesPdfFileSignature()
    {
        var file = new PdfReportExporter().Export(Sample());

        Assert.Equal("application/pdf", file.ContentType);
        Assert.Equal("Active-Accounts.pdf", file.FileName);
        Assert.Equal("%PDF", Encoding.ASCII.GetString(file.Content, 0, 4)); // PDF magic
        Assert.True(file.Content.Length > 400);
    }

    [Fact]
    public void Image_ProducesPngFileSignature()
    {
        var file = new ImageReportExporter().Export(Sample());

        Assert.Equal("image/png", file.ContentType);
        Assert.Equal("Active-Accounts.png", file.FileName);
        // PNG 8-byte magic number.
        Assert.Equal(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, file.Content.Take(8).ToArray());
    }

    [Fact]
    public void Service_DispatchesByFormat()
    {
        var service = new ReportExportService([new CsvReportExporter(), new ExcelReportExporter()]);

        var csv = service.Export(Sample(), ExportFormat.Csv);
        var excel = service.Export(Sample(), ExportFormat.Excel);

        Assert.True(csv.IsSuccess);
        Assert.Equal("text/csv", csv.Value.ContentType);
        Assert.True(excel.IsSuccess);
        Assert.EndsWith(".xlsx", excel.Value.FileName);
    }

    [Fact]
    public void Service_UnknownFormat_FailsGracefully()
    {
        var service = new ReportExportService([new CsvReportExporter()]);

        var result = service.Export(Sample(), ExportFormat.Excel);

        Assert.False(result.IsSuccess);
        Assert.Equal("unsupported_format", result.Error!.Code);
    }

    private static ReportResult Sample() => new()
    {
        ReportId = Guid.NewGuid(),
        ReportName = "Active Accounts",
        Columns =
        [
            new ReportResultColumn { Alias = "name", Label = "Name" },
            new ReportResultColumn { Alias = "phone", Label = "Phone" }
        ],
        Rows =
        [
            Row(("name", "Doha, Inc"), ("phone", "555\"6")),
            Row(("name", "Acme"), ("phone", null))
        ],
        RowCount = 2
    };

    private static ReportResultRow Row(params (string Alias, string? Text)[] cells) => new()
    {
        Cells = cells.ToDictionary(c => c.Alias, c => new ReportCell(c.Text, c.Text), StringComparer.Ordinal)
    };
}
