using OfficeOpenXml;
using OfficeOpenXml.Style;
using System.Drawing;

namespace Maqsad.CrmJsUrlExtractor;

/// <summary>
/// Exports extracted URL records to an Excel workbook (.xlsx)
/// with formatting, auto-filter, and a summary sheet.
/// </summary>
public sealed class ExcelExporter
{
    private static readonly Color HeaderBackground = Color.FromArgb(31, 78, 121);   // dark blue
    private static readonly Color HeaderForeground = Color.White;
    private static readonly Color CommentRowTint   = Color.FromArgb(255, 242, 204); // light amber
    private static readonly Color AlternateRowTint = Color.FromArgb(242, 242, 242); // light grey

    private static readonly Dictionary<UrlCategory, Color> CategoryColors = new()
    {
        { UrlCategory.ODataApi,                 Color.FromArgb(198, 224, 180) }, // green
        { UrlCategory.SsrsReport,               Color.FromArgb(189, 215, 238) }, // blue
        { UrlCategory.SoapOrganizationService,  Color.FromArgb(255, 199, 206) }, // red — deprecated
        { UrlCategory.ODataV1OrganizationData,  Color.FromArgb(255, 199, 206) }, // red — deprecated
        { UrlCategory.CrmDialog,                Color.FromArgb(255, 235, 156) }, // yellow
        { UrlCategory.CrmNavigation,            Color.FromArgb(255, 235, 156) }, // yellow
        { UrlCategory.WebResource,              Color.FromArgb(198, 224, 180) }, // green
        { UrlCategory.CustomWebApplication,     Color.FromArgb(255, 199, 206) }, // red — needs migration
        { UrlCategory.SharePoint,               Color.FromArgb(189, 215, 238) }, // blue
        { UrlCategory.SoapNamespace,            Color.FromArgb(230, 230, 230) }, // grey
        { UrlCategory.Absolute,                 Color.FromArgb(189, 215, 238) }, // blue
        { UrlCategory.RelativePath,             Color.FromArgb(242, 242, 242) }, // grey
    };

    /// <summary>
    /// Writes all URL records to an Excel file.
    /// Creates two sheets: "URL Inventory" (full detail) and "Summary" (counts by category).
    /// </summary>
    /// <param name="records">URL records to export.</param>
    /// <param name="outputPath">Target .xlsx file path.</param>
    public void Export(IReadOnlyList<UrlRecord> records, string outputPath)
    {
        ExcelPackage.LicenseContext = LicenseContext.NonCommercial;

        using ExcelPackage package = new();

        WriteInventorySheet(package, records);
        WriteSummarySheet(package, records);

        package.SaveAs(new FileInfo(outputPath));
    }

    // ── Private sheet builders ───────────────────────────────────────────────

    private static void WriteInventorySheet(ExcelPackage package, IReadOnlyList<UrlRecord> records)
    {
        ExcelWorksheet sheet = package.Workbook.Worksheets.Add("URL Inventory");

        WriteInventoryHeaders(sheet);
        WriteInventoryRows(sheet, records);
        FormatInventorySheet(sheet, records.Count);
    }

    private static void WriteInventoryHeaders(ExcelWorksheet sheet)
    {
        string[] headers =
        [
            "Library Name", "File Path", "Line #", "URL",
            "Category", "In Comment?", "Raw Source Line"
        ];

        for (int col = 1; col <= headers.Length; col++)
        {
            ExcelRange cell = sheet.Cells[1, col];
            cell.Value = headers[col - 1];
            cell.Style.Font.Bold = true;
            cell.Style.Font.Color.SetColor(HeaderForeground);
            cell.Style.Fill.PatternType = ExcelFillStyle.Solid;
            cell.Style.Fill.BackgroundColor.SetColor(HeaderBackground);
            cell.Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;
        }
    }

    private static void WriteInventoryRows(ExcelWorksheet sheet, IReadOnlyList<UrlRecord> records)
    {
        for (int i = 0; i < records.Count; i++)
        {
            UrlRecord record = records[i];
            int       row    = i + 2;

            sheet.Cells[row, 1].Value = record.LibraryName;
            sheet.Cells[row, 2].Value = record.FilePath;
            sheet.Cells[row, 3].Value = record.LineNumber;
            sheet.Cells[row, 4].Value = record.Url;
            sheet.Cells[row, 5].Value = CategoryLabel(record.Category);
            sheet.Cells[row, 6].Value = record.IsInComment ? "Yes" : "No";
            sheet.Cells[row, 7].Value = TruncateLine(record.RawLine, maxLength: 200);

            ApplyRowColor(sheet, row, record);
        }
    }

    private static void ApplyRowColor(ExcelWorksheet sheet, int row, UrlRecord record)
    {
        Color rowColor = record.IsInComment
            ? CommentRowTint
            : CategoryColors.GetValueOrDefault(record.Category, AlternateRowTint);

        ExcelRange rowRange = sheet.Cells[row, 1, row, 7];
        rowRange.Style.Fill.PatternType = ExcelFillStyle.Solid;
        rowRange.Style.Fill.BackgroundColor.SetColor(rowColor);
    }

    private static void FormatInventorySheet(ExcelWorksheet sheet, int rowCount)
    {
        // Auto-filter on header row
        sheet.Cells[1, 1, 1, 7].AutoFilter = true;

        // Freeze the header row
        sheet.View.FreezePanes(2, 1);

        // Column widths
        sheet.Column(1).Width = 28;  // Library Name
        sheet.Column(2).Width = 50;  // File Path
        sheet.Column(3).Width = 10;  // Line #
        sheet.Column(4).Width = 80;  // URL
        sheet.Column(5).Width = 28;  // Category
        sheet.Column(6).Width = 14;  // In Comment
        sheet.Column(7).Width = 80;  // Raw Line

        // Wrap URL and raw line columns
        sheet.Column(4).Style.WrapText = true;
        sheet.Column(7).Style.WrapText = true;

        // Thin border on all data cells
        ExcelRange dataRange = sheet.Cells[1, 1, rowCount + 1, 7];
        dataRange.Style.Border.BorderAround(ExcelBorderStyle.Thin);
    }

    private static void WriteSummarySheet(ExcelPackage package, IReadOnlyList<UrlRecord> records)
    {
        ExcelWorksheet sheet = package.Workbook.Worksheets.Add("Summary");

        // Title
        sheet.Cells[1, 1].Value = "CRM JavaScript URL Inventory — Summary";
        sheet.Cells[1, 1].Style.Font.Bold = true;
        sheet.Cells[1, 1].Style.Font.Size = 14;
        sheet.Cells[1, 1, 1, 4].Merge = true;

        // By-Library section
        WriteSectionHeader(sheet, row: 3, "URLs by Library");
        WriteLibrarySummary(sheet, records, startRow: 4);

        int libraryCount = records.Select(r => r.LibraryName).Distinct().Count();
        int byLibraryEnd = 4 + libraryCount + 1;

        // By-Category section
        WriteSectionHeader(sheet, row: byLibraryEnd + 2, "URLs by Category");
        WriteCategorySummary(sheet, records, startRow: byLibraryEnd + 3);

        sheet.Column(1).Width = 40;
        sheet.Column(2).Width = 20;
        sheet.Column(3).Width = 20;
        sheet.Column(4).Width = 20;
    }

    private static void WriteSectionHeader(ExcelWorksheet sheet, int row, string title)
    {
        ExcelRange cell = sheet.Cells[row, 1];
        cell.Value = title;
        cell.Style.Font.Bold = true;
        cell.Style.Font.Color.SetColor(HeaderForeground);
        cell.Style.Fill.PatternType = ExcelFillStyle.Solid;
        cell.Style.Fill.BackgroundColor.SetColor(HeaderBackground);
        sheet.Cells[row, 1, row, 4].Merge = true;
    }

    private static void WriteLibrarySummary(
        ExcelWorksheet sheet,
        IReadOnlyList<UrlRecord> records,
        int startRow)
    {
        sheet.Cells[startRow, 1].Value = "Library";
        sheet.Cells[startRow, 2].Value = "Total URLs";
        sheet.Cells[startRow, 3].Value = "In Code";
        sheet.Cells[startRow, 4].Value = "In Comments";
        MakeBoldRow(sheet, startRow, 4);

        IEnumerable<IGrouping<string, UrlRecord>> groups = records
            .GroupBy(r => r.LibraryName)
            .OrderBy(g => g.Key);

        int row = startRow + 1;
        foreach (IGrouping<string, UrlRecord> group in groups)
        {
            sheet.Cells[row, 1].Value = group.Key;
            sheet.Cells[row, 2].Value = group.Count();
            sheet.Cells[row, 3].Value = group.Count(r => !r.IsInComment);
            sheet.Cells[row, 4].Value = group.Count(r => r.IsInComment);
            row++;
        }

        // Totals
        sheet.Cells[row, 1].Value = "TOTAL";
        sheet.Cells[row, 2].Value = records.Count;
        sheet.Cells[row, 3].Value = records.Count(r => !r.IsInComment);
        sheet.Cells[row, 4].Value = records.Count(r => r.IsInComment);
        MakeBoldRow(sheet, row, 4);
    }

    private static void WriteCategorySummary(
        ExcelWorksheet sheet,
        IReadOnlyList<UrlRecord> records,
        int startRow)
    {
        sheet.Cells[startRow, 1].Value = "Category";
        sheet.Cells[startRow, 2].Value = "Count";
        sheet.Cells[startRow, 3].Value = "Migration Priority";
        MakeBoldRow(sheet, startRow, 3);

        IEnumerable<IGrouping<UrlCategory, UrlRecord>> groups = records
            .GroupBy(r => r.Category)
            .OrderByDescending(g => g.Count());

        int row = startRow + 1;
        foreach (IGrouping<UrlCategory, UrlRecord> group in groups)
        {
            sheet.Cells[row, 1].Value = CategoryLabel(group.Key);
            sheet.Cells[row, 2].Value = group.Count();
            sheet.Cells[row, 3].Value = MigrationPriority(group.Key);

            // Colour the priority cell
            Color priorityColor = group.Key is
                UrlCategory.SoapOrganizationService or
                UrlCategory.ODataV1OrganizationData or
                UrlCategory.CustomWebApplication
                    ? Color.FromArgb(255, 199, 206)   // red
                    : Color.FromArgb(198, 224, 180);  // green

            sheet.Cells[row, 3].Style.Fill.PatternType = ExcelFillStyle.Solid;
            sheet.Cells[row, 3].Style.Fill.BackgroundColor.SetColor(priorityColor);
            row++;
        }
    }

    private static void MakeBoldRow(ExcelWorksheet sheet, int row, int cols)
    {
        sheet.Cells[row, 1, row, cols].Style.Font.Bold = true;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static string CategoryLabel(UrlCategory category) => category switch
    {
        UrlCategory.ODataApi                => "OData API (v9.2+)",
        UrlCategory.SsrsReport              => "SSRS Report",
        UrlCategory.SoapOrganizationService => "SOAP Organization Service ⚠",
        UrlCategory.ODataV1OrganizationData => "OData v1 OrganizationData.svc ⚠",
        UrlCategory.CrmDialog               => "CRM Dialog",
        UrlCategory.CrmNavigation           => "CRM Navigation (main.aspx)",
        UrlCategory.WebResource             => "Web Resource",
        UrlCategory.CustomWebApplication    => "Custom Web Application ⚠",
        UrlCategory.SharePoint              => "SharePoint",
        UrlCategory.SoapNamespace           => "SOAP Namespace URI",
        UrlCategory.Absolute                => "Absolute URL",
        UrlCategory.RelativePath            => "Relative Path",
        _                                   => category.ToString()
    };

    private static string MigrationPriority(UrlCategory category) => category switch
    {
        UrlCategory.SoapOrganizationService => "HIGH — Replace with Xrm.WebApi",
        UrlCategory.ODataV1OrganizationData => "HIGH — Replace with Xrm.WebApi",
        UrlCategory.CustomWebApplication    => "HIGH — Harden / replace with PCF",
        UrlCategory.CrmDialog               => "MEDIUM — Migrate to openConfirmDialog",
        UrlCategory.ODataApi                => "LOW — Verify v9.2 compatibility",
        UrlCategory.SsrsReport              => "LOW — Verify SSRS server reference",
        UrlCategory.SoapNamespace           => "INFO — Namespace constant, no action",
        _                                   => "INFO"
    };

    private static string TruncateLine(string line, int maxLength) =>
        line.Length <= maxLength ? line : line[..maxLength] + "…";
}
