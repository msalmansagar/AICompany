using System.Text.RegularExpressions;

namespace Maqsad.CrmJsUrlExtractor;

/// <summary>
/// Scans JavaScript source files and extracts all URL references —
/// both absolute (http/https) and CRM-specific relative paths.
/// </summary>
public sealed class JsUrlExtractor
{
    // Matches absolute URLs: http:// or https://
    private static readonly Regex AbsoluteUrlPattern = new(
        @"https?://[^\s""'`\)\]\\>]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // Matches CRM-specific relative paths inside string literals or concatenations
    private static readonly Regex RelativePathPattern = new(
        @"(?:[""`']|[+\s])(/(?:api/data|XRMServices|ReportServer|cs/dialog|main\.aspx|isv/|WebResources/)[^\s""'`\)\]\\>]*)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // Matches relative paths that start standalone (not inside a string concat)
    private static readonly Regex StandaloneRelativePattern = new(
        @"""(/(?:api/data|XRMServices|ReportServer|cs/dialog|main\.aspx|isv/|WebResources/)[^""]*)""|'(/(?:api/data|XRMServices|ReportServer|cs/dialog|main\.aspx|isv/|WebResources/)[^']*)'",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>
    /// Extracts all URL records from a single JavaScript file.
    /// </summary>
    /// <param name="filePath">Absolute path to the .js file.</param>
    /// <returns>Sequence of <see cref="UrlRecord"/> instances, one per URL occurrence.</returns>
    public IEnumerable<UrlRecord> ExtractFromFile(string filePath)
    {
        string libraryName = Path.GetFileNameWithoutExtension(filePath);
        string[] lines     = File.ReadAllLines(filePath);

        for (int i = 0; i < lines.Length; i++)
        {
            string line       = lines[i];
            bool   isComment  = IsCommentLine(line);
            int    lineNumber = i + 1;

            foreach (string url in ExtractUrlsFromLine(line))
            {
                yield return new UrlRecord(
                    LibraryName: libraryName,
                    FilePath:    filePath,
                    LineNumber:  lineNumber,
                    Url:         url,
                    Category:    UrlClassifier.Classify(url),
                    IsInComment: isComment,
                    RawLine:     line.Trim()
                );
            }
        }
    }

    /// <summary>
    /// Recursively scans a directory for .js files and extracts all URLs.
    /// </summary>
    /// <param name="directoryPath">Root directory to scan.</param>
    /// <param name="searchPattern">File search pattern (default: *.js).</param>
    /// <returns>All URL records found across all matching files.</returns>
    public IEnumerable<UrlRecord> ExtractFromDirectory(
        string directoryPath,
        string searchPattern = "*.js")
    {
        if (!Directory.Exists(directoryPath))
            throw new DirectoryNotFoundException($"Directory not found: {directoryPath}");

        IEnumerable<string> files = Directory.EnumerateFiles(
            directoryPath, searchPattern, SearchOption.AllDirectories);

        return files.SelectMany(ExtractFromFile);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private static IEnumerable<string> ExtractUrlsFromLine(string line)
    {
        HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);

        foreach (Match m in AbsoluteUrlPattern.Matches(line))
        {
            string url = CleanUrl(m.Value);
            if (seen.Add(url)) yield return url;
        }

        foreach (Match m in RelativePathPattern.Matches(line))
        {
            string url = CleanUrl(m.Groups[1].Value);
            if (!string.IsNullOrWhiteSpace(url) && seen.Add(url))
                yield return url;
        }

        foreach (Match m in StandaloneRelativePattern.Matches(line))
        {
            // Group 1 = double-quoted, Group 2 = single-quoted
            string url = CleanUrl(m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value);
            if (!string.IsNullOrWhiteSpace(url) && seen.Add(url))
                yield return url;
        }
    }

    private static bool IsCommentLine(string line)
    {
        string trimmed = line.TrimStart();
        return trimmed.StartsWith("//", StringComparison.Ordinal)
            || trimmed.StartsWith("*",  StringComparison.Ordinal)
            || trimmed.StartsWith("/*", StringComparison.Ordinal);
    }

    private static string CleanUrl(string raw)
    {
        // Strip trailing punctuation that was captured but is not part of the URL
        return raw.TrimEnd(',', ';', ')', ']', '"', '\'', '`', ' ', '\\');
    }
}
