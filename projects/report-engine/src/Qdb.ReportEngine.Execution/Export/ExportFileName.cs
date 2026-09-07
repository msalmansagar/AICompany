using System.Text;

namespace Qdb.ReportEngine.Execution.Export;

/// <summary>Builds a safe download file name from a report name and an extension.</summary>
internal static class ExportFileName
{
    /// <summary>Returns a sanitized "<c>name.ext</c>", falling back to "report" for empty names.</summary>
    public static string For(string reportName, string extension)
    {
        var builder = new StringBuilder(reportName.Length);
        foreach (var ch in reportName)
        {
            builder.Append(char.IsLetterOrDigit(ch) ? ch : '-');
        }

        var slug = builder.ToString().Trim('-');
        while (slug.Contains("--", StringComparison.Ordinal))
        {
            slug = slug.Replace("--", "-", StringComparison.Ordinal);
        }

        return $"{(slug.Length == 0 ? "report" : slug)}.{extension}";
    }
}
