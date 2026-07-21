namespace Qdb.ReportEngine.Core.Models;

/// <summary>Output formats a report result can be exported to. PDF/Word/Image plug in later.</summary>
public enum ExportFormat
{
    Csv,
    Excel,
    Word
}

/// <summary>A rendered export: the file bytes plus how to serve them.</summary>
public sealed record ExportedFile(byte[] Content, string ContentType, string FileName);
