namespace Qdb.ReportEngine.Core.Models;

/// <summary>Output formats a report result can be exported to. PDF/Word/Image plug in later.</summary>
public enum ExportFormat
{
    Csv,
    Excel,
    Word,
    Pdf,
    Image
}

/// <summary>A rendered export: the file bytes plus how to serve them.</summary>
public sealed record ExportedFile(byte[] Content, string ContentType, string FileName);

/// <summary>How to render a report result as a chart image.</summary>
public sealed record ChartOptions(
    string ChartType = "column",
    string? CategoryAlias = null,
    string? ValueAlias = null,
    int Width = 900,
    int Height = 500);
