using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Export;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class ReportChartServiceTests
{
    private static readonly byte[] PngMagic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    [Theory]
    [InlineData("column")]
    [InlineData("bar")]
    [InlineData("line")]
    [InlineData("pie")]
    public void Render_ProducesPngForEachChartType(string chartType)
    {
        var result = new ReportChartService().Render(Sample(), new ChartOptions(chartType, "status", "total"));

        Assert.True(result.IsSuccess);
        Assert.Equal("image/png", result.Value.ContentType);
        Assert.EndsWith(".png", result.Value.FileName);
        Assert.Equal(PngMagic, result.Value.Content.Take(8).ToArray());
    }

    [Fact]
    public void Render_NoNumericColumn_Fails()
    {
        var result = new ReportChartService().Render(TextOnly(), new ChartOptions("column"));

        Assert.False(result.IsSuccess);
        Assert.Equal("invalid_request", result.Error!.Code);
    }

    private static ReportResult Sample() => new()
    {
        ReportId = Guid.NewGuid(),
        ReportName = "Accounts by Status",
        Columns = [new ReportResultColumn { Alias = "status" }, new ReportResultColumn { Alias = "total" }],
        Rows =
        [
            Row(("status", "Active", "Active"), ("total", 5L, "5")),
            Row(("status", "Inactive", "Inactive"), ("total", 2L, "2"))
        ]
    };

    private static ReportResult TextOnly() => new()
    {
        ReportId = Guid.NewGuid(),
        ReportName = "Names",
        Columns = [new ReportResultColumn { Alias = "name" }],
        Rows = [Row(("name", "Acme", "Acme"))]
    };

    private static ReportResultRow Row(params (string Alias, object? Value, string Text)[] cells) => new()
    {
        Cells = cells.ToDictionary(c => c.Alias, c => new ReportCell(c.Value, c.Text), StringComparer.Ordinal)
    };
}
