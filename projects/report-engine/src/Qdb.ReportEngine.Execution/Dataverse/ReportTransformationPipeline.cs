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
