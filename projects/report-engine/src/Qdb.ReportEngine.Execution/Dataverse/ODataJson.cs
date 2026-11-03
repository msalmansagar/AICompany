using System.Text.Json;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Parses OData JSON responses into plain attribute rows. Aggregate FetchXML results arrive as a
/// <c>value</c> array of flat objects (aliases + formatted-value annotations); this flattens each
/// object to a case-sensitive dictionary of CLR primitives. Pure — testable without a live CRM.
/// </summary>
public static class ODataJson
{
    /// <summary>Reads the <c>value</c> array of <paramref name="json"/> into attribute rows.</summary>
    public static IReadOnlyList<IReadOnlyDictionary<string, object?>> ReadValueRows(string json)
    {
        ArgumentException.ThrowIfNullOrEmpty(json);

        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("value", out var array) || array.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var rows = new List<IReadOnlyDictionary<string, object?>>(array.GetArrayLength());
        foreach (var element in array.EnumerateArray())
        {
            rows.Add(ReadObject(element));
        }

        return rows;
    }

    private static Dictionary<string, object?> ReadObject(JsonElement element)
    {
        var row = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            row[property.Name] = ToClr(property.Value);
        }

        return row;
    }

    private static object? ToClr(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.String => value.GetString(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Null => null,
        JsonValueKind.Number => ReadNumber(value),
        _ => value.GetRawText()
    };

    private static object ReadNumber(JsonElement value)
    {
        if (value.TryGetInt64(out var integer))
        {
            return integer;
        }

        return value.TryGetDecimal(out var dec) ? dec : value.GetDouble();
    }
}
