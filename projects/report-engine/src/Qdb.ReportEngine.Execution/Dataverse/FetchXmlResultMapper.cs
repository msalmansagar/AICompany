using System.Globalization;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Maps raw Web API aggregate rows (produced by <see cref="FetchXmlAggregateBuilder"/> queries) to
/// <see cref="DataPoint"/>s. Pure and side-effect free — testable without a live CRM. Aggregate
/// queries alias the grouping column <c>group</c> and the measure <c>value</c>; the Web API also
/// returns a <c>group@OData.Community.Display.V1.FormattedValue</c> label for coded/date groups.
/// </summary>
public static class FetchXmlResultMapper
{
    private const string GroupAlias = "group";
    private const string ValueAlias = "value";
    private const string FormattedSuffix = "@OData.Community.Display.V1.FormattedValue";

    /// <summary>
    /// Maps <paramref name="rows"/> to data points. Ungrouped single-row results take
    /// <paramref name="ungroupedLabel"/> as their label.
    /// </summary>
    public static IReadOnlyList<DataPoint> Map(
        IReadOnlyList<IReadOnlyDictionary<string, object?>> rows, string ungroupedLabel)
    {
        ArgumentNullException.ThrowIfNull(rows);
        ArgumentException.ThrowIfNullOrEmpty(ungroupedLabel);

        var points = new List<DataPoint>(rows.Count);
        foreach (var row in rows)
        {
            points.Add(new DataPoint(ResolveLabel(row, ungroupedLabel), ResolveValue(row)));
        }

        return points;
    }

    private static string ResolveLabel(IReadOnlyDictionary<string, object?> row, string fallback)
    {
        if (row.TryGetValue(GroupAlias + FormattedSuffix, out var formatted) && formatted is not null)
        {
            return formatted.ToString() ?? fallback;
        }

        if (row.TryGetValue(GroupAlias, out var raw) && raw is not null)
        {
            var text = Stringify(raw);
            return string.IsNullOrEmpty(text) ? fallback : text;
        }

        return fallback;
    }

    private static decimal ResolveValue(IReadOnlyDictionary<string, object?> row) =>
        row.TryGetValue(ValueAlias, out var value) ? ToDecimal(value) : 0m;

    private static decimal ToDecimal(object? value) => value switch
    {
        null => 0m,
        decimal d => d,
        double dbl => (decimal)dbl,
        long l => l,
        int i => i,
        string s when decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) => parsed,
        _ => 0m
    };

    private static string Stringify(object value) => value switch
    {
        double dbl => dbl.ToString(CultureInfo.InvariantCulture),
        decimal dec => dec.ToString(CultureInfo.InvariantCulture),
        _ => value.ToString() ?? string.Empty
    };
}
