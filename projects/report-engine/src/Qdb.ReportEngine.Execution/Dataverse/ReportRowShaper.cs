using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Shapes raw Web API rows into <see cref="ReportResultRow"/>s aligned to the report's output
/// columns. Each cell carries the raw value and its formatted display text (from the
/// FormattedValue annotation), falling back across the alias, attribute, and lookup key forms.
/// Pure — testable without a live CRM.
/// </summary>
public static class ReportRowShaper
{
    private const string FormattedSuffix = "@OData.Community.Display.V1.FormattedValue";

    /// <summary>Shapes <paramref name="rawRows"/> into result rows for <paramref name="columns"/>.</summary>
    public static IReadOnlyList<ReportResultRow> Shape(
        IReadOnlyList<ReportResultColumn> columns,
        IReadOnlyList<IReadOnlyDictionary<string, object?>> rawRows)
    {
        if (columns is null) throw new ArgumentNullException(nameof(columns));
        if (rawRows is null) throw new ArgumentNullException(nameof(rawRows));

        var rows = new List<ReportResultRow>(rawRows.Count);
        foreach (var raw in rawRows)
        {
            var cells = new Dictionary<string, ReportCell>(columns.Count, StringComparer.Ordinal);
            foreach (var column in columns)
            {
                cells[column.Alias] = ReadCell(raw, column);
            }

            rows.Add(new ReportResultRow { Cells = cells });
        }

        return rows;
    }

    private static ReportCell ReadCell(IReadOnlyDictionary<string, object?> row, ReportResultColumn column)
    {
        var keys = CandidateKeys(column);
        var value = keys.Select(k => Raw(row, k)).FirstOrDefault(v => v is not null);
        var text = keys.Select(k => Formatted(row, k)).FirstOrDefault(t => t is not null) ?? value?.ToString();
        return new ReportCell(value, text);
    }

    // The alias wins; fall back to the attribute name and the "_<attr>_value" lookup form.
    private static IEnumerable<string> CandidateKeys(ReportResultColumn column)
    {
        yield return column.Alias;
        if (!string.IsNullOrEmpty(column.Attribute) && column.Attribute != column.Alias)
        {
            yield return column.Attribute;
        }

        if (!string.IsNullOrEmpty(column.Attribute))
        {
            yield return $"_{column.Attribute}_value";
        }
    }

    private static object? Raw(IReadOnlyDictionary<string, object?> row, string key) =>
        row.TryGetValue(key, out var value) ? value : null;

    private static string? Formatted(IReadOnlyDictionary<string, object?> row, string key) =>
        row.TryGetValue(key + FormattedSuffix, out var value) && value is not null ? value.ToString() : null;
}
