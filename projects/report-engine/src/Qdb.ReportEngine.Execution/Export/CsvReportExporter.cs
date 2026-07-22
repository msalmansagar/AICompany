using System.Text;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Export;

/// <summary>
/// Renders a report result to RFC 4180 CSV (UTF-8 with BOM so Excel opens it correctly). Header
/// cells are column labels; body cells use the formatted display text.
/// </summary>
public sealed class CsvReportExporter : IReportExporter
{
    /// <inheritdoc />
    public ExportFormat Format => ExportFormat.Csv;

    /// <inheritdoc />
    public ExportedFile Export(ReportResult result)
    {
        ArgumentNullException.ThrowIfNull(result);

        const string crlf = "\r\n"; // RFC 4180 §2 mandates CRLF regardless of host OS.
        var builder = new StringBuilder();
        builder.Append(string.Join(',', result.Columns.Select(c => Escape(c.Label ?? c.Alias)))).Append(crlf);
        foreach (var row in result.Rows)
        {
            var cells = result.Columns.Select(c => Escape(row.Cells.TryGetValue(c.Alias, out var cell) ? cell.Text : null));
            builder.Append(string.Join(',', cells)).Append(crlf);
        }

        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(builder.ToString())).ToArray();
        return new ExportedFile(bytes, "text/csv", ExportFileName.For(result.ReportName, "csv"));
    }

    // Quote when the value contains a comma, quote, or newline; double embedded quotes.
    private static string Escape(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        if (value.IndexOfAny([',', '"', '\n', '\r']) < 0)
        {
            return value;
        }

        return $"\"{value.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
    }
}
