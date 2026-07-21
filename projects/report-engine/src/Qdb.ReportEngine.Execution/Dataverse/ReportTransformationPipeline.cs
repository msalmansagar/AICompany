using System.Globalization;
using System.Text.Json;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Applies a report's enabled transformations to its result, in step order. Each transform reads
/// its own JSON config. Implemented transforms: RenameColumns, NullHandling, Masking. Unimplemented
/// transform types (and malformed config) pass the result through unchanged. Pure — no I/O.
/// </summary>
public static class ReportTransformationPipeline
{
    /// <summary>Applies <paramref name="transformations"/> to <paramref name="result"/> in step order.</summary>
    public static ReportResult Apply(IReadOnlyList<ReportTransformation> transformations, ReportResult result)
    {
        ArgumentNullException.ThrowIfNull(transformations);
        ArgumentNullException.ThrowIfNull(result);

        foreach (var transformation in transformations.Where(t => t.Enabled).OrderBy(t => t.StepOrder))
        {
            result = ApplyOne(transformation, result);
        }

        return result;
    }

    private static ReportResult ApplyOne(ReportTransformation transformation, ReportResult result)
    {
        var config = ParseConfig(transformation.ConfigJson);
        if (config is null)
        {
            return result;
        }

        using (config)
        {
            return transformation.TransformType?.Label switch
            {
                "RenameColumns" => RenameColumns(result, config.RootElement),
                "NullHandling" => NullHandling(result, config.RootElement),
                "Masking" => Masking(result, config.RootElement),
                "NumberFormat" => NumberFormat(result, config.RootElement),
                "CurrencyFormat" => CurrencyFormat(result, config.RootElement),
                "DateFormat" => DateFormat(result, config.RootElement),
                "Mapping" => Mapping(result, config.RootElement),
                "MergeColumns" => MergeColumns(result, config.RootElement),
                _ => result // unimplemented type — pass through.
            };
        }
    }

    // { "renames": { "<alias>": "<new label>" } }
    private static ReportResult RenameColumns(ReportResult result, JsonElement config)
    {
        if (!config.TryGetProperty("renames", out var renames) || renames.ValueKind != JsonValueKind.Object)
        {
            return result;
        }

        var columns = result.Columns.Select(column =>
            renames.TryGetProperty(column.Alias, out var label) && label.ValueKind == JsonValueKind.String
                ? column with { Label = label.GetString() }
                : column).ToList();
        return result with { Columns = columns };
    }

    // { "default": "-", "columns": { "<alias>": "<replacement>" } }
    private static ReportResult NullHandling(ReportResult result, JsonElement config)
    {
        var globalDefault = config.TryGetProperty("default", out var d) && d.ValueKind == JsonValueKind.String ? d.GetString() : null;
        var perColumn = ReadStringMap(config, "columns");

        return MapCells(result, (alias, cell) =>
        {
            if (!string.IsNullOrEmpty(cell.Text))
            {
                return cell;
            }

            var replacement = perColumn.GetValueOrDefault(alias) ?? globalDefault;
            return replacement is null ? cell : new ReportCell(cell.Value, replacement);
        });
    }

    // { "columns": ["<alias>"], "keepLast": 4, "mask": "*" }
    private static ReportResult Masking(ReportResult result, JsonElement config)
    {
        if (!config.TryGetProperty("columns", out var columnsElement) || columnsElement.ValueKind != JsonValueKind.Array)
        {
            return result;
        }

        var masked = columnsElement.EnumerateArray()
            .Where(e => e.ValueKind == JsonValueKind.String)
            .Select(e => e.GetString()!)
            .ToHashSet(StringComparer.Ordinal);
        var keepLast = config.TryGetProperty("keepLast", out var k) && k.TryGetInt32(out var kv) ? Math.Max(kv, 0) : 0;
        var maskChar = config.TryGetProperty("mask", out var m) && m.ValueKind == JsonValueKind.String && m.GetString() is { Length: > 0 } s ? s[0] : '*';

        return MapCells(result, (alias, cell) =>
            masked.Contains(alias) && !string.IsNullOrEmpty(cell.Text)
                ? new ReportCell(cell.Value, MaskText(cell.Text, keepLast, maskChar))
                : cell);
    }

    // { "columns": ["<alias>"], "decimals": 2, "thousands": true }
    private static ReportResult NumberFormat(ReportResult result, JsonElement config)
    {
        var columns = ReadColumnSet(config);
        var decimals = config.TryGetProperty("decimals", out var d) && d.TryGetInt32(out var dv) ? Math.Max(dv, 0) : 2;
        var thousands = !config.TryGetProperty("thousands", out var t) || t.ValueKind != JsonValueKind.False;
        var pattern = (thousands ? "#,##0" : "0") + (decimals > 0 ? "." + new string('0', decimals) : string.Empty);

        return FormatColumns(result, columns, cell =>
            ToDecimal(cell) is { } number ? number.ToString(pattern, CultureInfo.InvariantCulture) : cell.Text);
    }

    // { "columns": ["<alias>"], "symbol": "QAR", "decimals": 2 }
    private static ReportResult CurrencyFormat(ReportResult result, JsonElement config)
    {
        var columns = ReadColumnSet(config);
        var symbol = config.TryGetProperty("symbol", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() : "QAR";
        var decimals = config.TryGetProperty("decimals", out var d) && d.TryGetInt32(out var dv) ? Math.Max(dv, 0) : 2;
        var pattern = "#,##0" + (decimals > 0 ? "." + new string('0', decimals) : string.Empty);

        return FormatColumns(result, columns, cell =>
            ToDecimal(cell) is { } number ? $"{symbol} {number.ToString(pattern, CultureInfo.InvariantCulture)}" : cell.Text);
    }

    // { "columns": ["<alias>"], "format": "dd MMM yyyy" }
    private static ReportResult DateFormat(ReportResult result, JsonElement config)
    {
        var columns = ReadColumnSet(config);
        var format = config.TryGetProperty("format", out var f) && f.ValueKind == JsonValueKind.String && f.GetString() is { Length: > 0 } fmt ? fmt : "yyyy-MM-dd";

        return FormatColumns(result, columns, cell =>
            ToDate(cell) is { } date ? date.ToString(format, CultureInfo.InvariantCulture) : cell.Text);
    }

    // { "column": "<alias>", "map": { "0": "No", "1": "Yes" }, "default": "?" }
    private static ReportResult Mapping(ReportResult result, JsonElement config)
    {
        if (!config.TryGetProperty("column", out var columnElement) || columnElement.ValueKind != JsonValueKind.String)
        {
            return result;
        }

        var column = columnElement.GetString()!;
        var map = ReadStringMap(config, "map");
        var fallback = config.TryGetProperty("default", out var def) && def.ValueKind == JsonValueKind.String ? def.GetString() : null;

        return MapCells(result, (alias, cell) =>
        {
            if (!string.Equals(alias, column, StringComparison.Ordinal))
            {
                return cell;
            }

            var key = cell.Value?.ToString() ?? cell.Text ?? string.Empty;
            return map.TryGetValue(key, out var mapped)
                ? new ReportCell(cell.Value, mapped)
                : fallback is null ? cell : new ReportCell(cell.Value, fallback);
        });
    }

    // { "columns": ["<alias>"], "into": "<alias>", "label": "<label>", "separator": " " }
    private static ReportResult MergeColumns(ReportResult result, JsonElement config)
    {
        var sources = config.TryGetProperty("columns", out var c) && c.ValueKind == JsonValueKind.Array
            ? c.EnumerateArray().Where(e => e.ValueKind == JsonValueKind.String).Select(e => e.GetString()!).ToList()
            : [];
        if (sources.Count == 0 || !config.TryGetProperty("into", out var i) || i.ValueKind != JsonValueKind.String)
        {
            return result;
        }

        var into = i.GetString()!;
        var label = config.TryGetProperty("label", out var l) && l.ValueKind == JsonValueKind.String ? l.GetString() : into;
        var separator = config.TryGetProperty("separator", out var sep) && sep.ValueKind == JsonValueKind.String ? sep.GetString()! : " ";

        var columns = result.Columns.Append(new ReportResultColumn { Alias = into, Label = label }).ToList();
        var rows = result.Rows.Select(row =>
        {
            var merged = string.Join(separator, sources
                .Select(a => row.Cells.TryGetValue(a, out var cell) ? cell.Text : null)
                .Where(text => !string.IsNullOrEmpty(text)));
            var cells = new Dictionary<string, ReportCell>(row.Cells, StringComparer.Ordinal) { [into] = new ReportCell(merged, merged) };
            return new ReportResultRow { Cells = cells };
        }).ToList();
        return result with { Columns = columns, Rows = rows };
    }

    private static ReportResult FormatColumns(ReportResult result, ISet<string> columns, Func<ReportCell, string?> format) =>
        MapCells(result, (alias, cell) =>
            columns.Contains(alias) && !string.IsNullOrEmpty(cell.Text) ? new ReportCell(cell.Value, format(cell)) : cell);

    private static ISet<string> ReadColumnSet(JsonElement config)
    {
        if (config.TryGetProperty("columns", out var element) && element.ValueKind == JsonValueKind.Array)
        {
            return element.EnumerateArray()
                .Where(e => e.ValueKind == JsonValueKind.String)
                .Select(e => e.GetString()!)
                .ToHashSet(StringComparer.Ordinal);
        }

        return new HashSet<string>(StringComparer.Ordinal);
    }

    private static decimal? ToDecimal(ReportCell cell)
    {
        if (cell.Value is decimal dec) return dec;
        if (cell.Value is double dbl) return (decimal)dbl;
        if (cell.Value is long l) return l;
        if (cell.Value is int n) return n;
        var text = cell.Value?.ToString() ?? cell.Text;
        return decimal.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) ? parsed : null;
    }

    private static DateTimeOffset? ToDate(ReportCell cell)
    {
        var text = cell.Value?.ToString() ?? cell.Text;
        return DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed) ? parsed : null;
    }

    private static string MaskText(string text, int keepLast, char maskChar)
    {
        if (keepLast >= text.Length)
        {
            return text;
        }

        return new string(maskChar, text.Length - keepLast) + text[^keepLast..];
    }

    private static ReportResult MapCells(ReportResult result, Func<string, ReportCell, ReportCell> transform)
    {
        var rows = result.Rows.Select(row =>
        {
            var cells = new Dictionary<string, ReportCell>(row.Cells.Count, StringComparer.Ordinal);
            foreach (var (alias, cell) in row.Cells)
            {
                cells[alias] = transform(alias, cell);
            }

            return new ReportResultRow { Cells = cells };
        }).ToList();
        return result with { Rows = rows };
    }

    private static Dictionary<string, string> ReadStringMap(JsonElement config, string property)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        if (config.TryGetProperty(property, out var element) && element.ValueKind == JsonValueKind.Object)
        {
            foreach (var member in element.EnumerateObject())
            {
                if (member.Value.ValueKind == JsonValueKind.String)
                {
                    map[member.Name] = member.Value.GetString()!;
                }
            }
        }

        return map;
    }

    private static JsonDocument? ParseConfig(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonDocument.Parse(json);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
