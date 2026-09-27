using System.Globalization;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Typed reads over a raw Web API attribute row (alias/name → CLR value). Coded (option-set) reads
/// pair the numeric value with its FormattedValue label annotation. Pure — no I/O.
/// </summary>
internal static class RowReader
{
    private const string FormattedSuffix = "@OData.Community.Display.V1.FormattedValue";

    public static string? String(IReadOnlyDictionary<string, object?> row, string key) =>
        TryResolve(row, key, out var value) && value is not null ? value.ToString() : null;

    public static bool Bool(IReadOnlyDictionary<string, object?> row, string key) =>
        TryResolve(row, key, out var value) && value switch
        {
            bool b => b,
            long l => l != 0,
            string s => bool.TryParse(s, out var parsed) && parsed,
            _ => false
        };

    /// <summary>
    /// A flag whose ABSENCE is meaningful. <see cref="Bool"/> answers false for a column the row does
    /// not carry, which for an "is enabled" flag would disable every record stored before the column
    /// existed — the whole organisation, on the day the feature ships.
    /// </summary>
    public static bool BoolOrDefault(IReadOnlyDictionary<string, object?> row, string key, bool fallback) =>
        TryResolve(row, key, out var value) && value is not null ? Bool(row, key) : fallback;

    public static int? Int(IReadOnlyDictionary<string, object?> row, string key)
    {
        if (!TryResolve(row, key, out var value) || value is null)
        {
            return null;
        }

        return value switch
        {
            long l => (int)l,
            int i => i,
            decimal d => (int)d,
            double db => (int)db,
            string s when int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => null
        };
    }

    public static int IntOrZero(IReadOnlyDictionary<string, object?> row, string key) => Int(row, key) ?? 0;

    public static Guid? Guid(IReadOnlyDictionary<string, object?> row, string key) =>
        TryResolve(row, key, out var value) && value is not null
            && System.Guid.TryParse(value.ToString(), out var parsed)
            ? parsed
            : null;

    public static CodedValue? Coded(IReadOnlyDictionary<string, object?> row, string key)
    {
        var code = Int(row, key);
        var label = String(row, key + FormattedSuffix) ?? String(row, LookupKey(key) + FormattedSuffix);
        return code is null && label is null ? null : new CodedValue(code, label);
    }

    // FetchXML/Web API returns lookup attributes as "_<name>_value", so fall back to that form.
    private static bool TryResolve(IReadOnlyDictionary<string, object?> row, string key, out object? value)
    {
        if (row.TryGetValue(key, out value))
        {
            return true;
        }

        return row.TryGetValue(LookupKey(key), out value);
    }

    private static string LookupKey(string key) => $"_{key}_value";
}
