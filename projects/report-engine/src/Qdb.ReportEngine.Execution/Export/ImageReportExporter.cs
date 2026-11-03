using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Models;
using SkiaSharp;

namespace Qdb.ReportEngine.Execution.Export;

/// <summary>
/// Renders a report result to a PNG table with SkiaSharp: column widths sized to content (capped),
/// a shaded bold header row, and grid lines. Single-image (no pagination) — sufficient for V1.
/// </summary>
public sealed class ImageReportExporter : IReportExporter
{
    private const float FontSize = 14f;
    private const float PadX = 10f;
    private const float PadY = 8f;
    private const float MaxColumnWidth = 320f;

    /// <inheritdoc />
    public ExportFormat Format => ExportFormat.Image;

    /// <inheritdoc />
    public ExportedFile Export(ReportResult result)
    {
        ArgumentNullException.ThrowIfNull(result);

        using var text = new SKPaint { Color = SKColors.Black, TextSize = FontSize, IsAntialias = true };
        using var header = new SKPaint { Color = SKColors.Black, TextSize = FontSize, IsAntialias = true, FakeBoldText = true };

        var columnWidths = MeasureColumns(result, text, header);
        var rowHeight = FontSize + (2 * PadY);
        var width = (int)Math.Ceiling(columnWidths.Sum());
        var height = (int)Math.Ceiling(rowHeight * (result.Rows.Count + 1));

        using var surface = SKSurface.Create(new SKImageInfo(Math.Max(width, 1), Math.Max(height, 1)));
        Draw(surface.Canvas, result, columnWidths, rowHeight, text, header);

        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return new ExportedFile(data.ToArray(), "image/png", ExportFileName.For(result.ReportName, "png"));
    }

    private static float[] MeasureColumns(ReportResult result, SKPaint text, SKPaint header)
    {
        var widths = new float[result.Columns.Count];
        for (var column = 0; column < result.Columns.Count; column++)
        {
            var headerText = result.Columns[column].Label ?? result.Columns[column].Alias;
            var widest = header.MeasureText(headerText);
            foreach (var row in result.Rows)
            {
                var cell = row.Cells.TryGetValue(result.Columns[column].Alias, out var c) ? c.Text : null;
                widest = Math.Max(widest, text.MeasureText(cell ?? string.Empty));
            }

            widths[column] = Math.Min(widest + (2 * PadX), MaxColumnWidth);
        }

        return widths;
    }

    private static void Draw(
        SKCanvas canvas, ReportResult result, float[] columnWidths, float rowHeight, SKPaint text, SKPaint header)
    {
        canvas.Clear(SKColors.White);
        using var headerFill = new SKPaint { Color = new SKColor(0xF0, 0xF0, 0xF0), Style = SKPaintStyle.Fill };
        using var grid = new SKPaint { Color = new SKColor(0xCC, 0xCC, 0xCC), Style = SKPaintStyle.Stroke, StrokeWidth = 1 };
        var totalWidth = columnWidths.Sum();

        canvas.DrawRect(0, 0, totalWidth, rowHeight, headerFill);
        DrawRow(canvas, result.Columns.Select(c => c.Label ?? c.Alias).ToList(), columnWidths, 0, rowHeight, header);
        for (var rowIndex = 0; rowIndex < result.Rows.Count; rowIndex++)
        {
            var values = result.Columns
                .Select(c => result.Rows[rowIndex].Cells.TryGetValue(c.Alias, out var cell) ? cell.Text ?? string.Empty : string.Empty)
                .ToList();
            DrawRow(canvas, values, columnWidths, rowHeight * (rowIndex + 1), rowHeight, text);
        }

        DrawGrid(canvas, columnWidths, rowHeight, result.Rows.Count + 1, grid);
    }

    private static void DrawRow(SKCanvas canvas, IReadOnlyList<string> values, float[] columnWidths, float top, float rowHeight, SKPaint paint)
    {
        var baseline = top + PadY - paint.FontMetrics.Ascent;
        var x = 0f;
        for (var column = 0; column < values.Count; column++)
        {
            canvas.DrawText(Clip(values[column], columnWidths[column], paint), x + PadX, baseline, paint);
            x += columnWidths[column];
        }
    }

    private static void DrawGrid(SKCanvas canvas, float[] columnWidths, float rowHeight, int rowCount, SKPaint grid)
    {
        var totalWidth = columnWidths.Sum();
        var totalHeight = rowHeight * rowCount;
        for (var row = 0; row <= rowCount; row++)
        {
            var y = row * rowHeight;
            canvas.DrawLine(0, y, totalWidth, y, grid);
        }

        var x = 0f;
        canvas.DrawLine(0, 0, 0, totalHeight, grid);
        foreach (var columnWidth in columnWidths)
        {
            x += columnWidth;
            canvas.DrawLine(x, 0, x, totalHeight, grid);
        }
    }

    // Truncates with an ellipsis so text never overflows its (capped) column.
    private static string Clip(string value, float columnWidth, SKPaint paint)
    {
        var available = columnWidth - (2 * PadX);
        if (paint.MeasureText(value) <= available)
        {
            return value;
        }

        var clipped = value;
        while (clipped.Length > 1 && paint.MeasureText(clipped + "…") > available)
        {
            clipped = clipped[..^1];
        }

        return clipped + "…";
    }
}
