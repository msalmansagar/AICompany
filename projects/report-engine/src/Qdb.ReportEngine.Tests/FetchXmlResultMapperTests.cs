using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class FetchXmlResultMapperTests
{
    [Fact]
    public void Map_GroupedRows_UsesFormattedValueForLabel()
    {
        var rows = new List<IReadOnlyDictionary<string, object?>>
        {
            Row(("group", 1), ("group@OData.Community.Display.V1.FormattedValue", "Active"), ("value", 100L)),
            Row(("group", 2), ("group@OData.Community.Display.V1.FormattedValue", "Closed"), ("value", 42L))
        };

        var points = FetchXmlResultMapper.Map(rows, "Total");

        Assert.Equal(2, points.Count);
        Assert.Equal("Active", points[0].Label);
        Assert.Equal(100m, points[0].Value);
        Assert.Equal("Closed", points[1].Label);
    }

    [Fact]
    public void Map_GroupedRowsWithoutFormattedValue_UsesRawGroup()
    {
        var rows = new List<IReadOnlyDictionary<string, object?>> { Row(("group", "Doha"), ("value", 7L)) };

        var points = FetchXmlResultMapper.Map(rows, "Total");

        Assert.Equal("Doha", points[0].Label);
        Assert.Equal(7m, points[0].Value);
    }

    [Fact]
    public void Map_UngroupedSingleRow_UsesUngroupedLabel()
    {
        var rows = new List<IReadOnlyDictionary<string, object?>> { Row(("value", 1250m)) };

        var points = FetchXmlResultMapper.Map(rows, "qdb_requestedamount");

        Assert.Single(points);
        Assert.Equal("qdb_requestedamount", points[0].Label);
        Assert.Equal(1250m, points[0].Value);
    }

    [Theory]
    [InlineData(5L, 5)]
    [InlineData(2.5, 2.5)]
    [InlineData("12.75", 12.75)]
    public void Map_CoercesNumericValueTypes(object rawValue, decimal expected)
    {
        var rows = new List<IReadOnlyDictionary<string, object?>> { Row(("value", rawValue)) };

        var points = FetchXmlResultMapper.Map(rows, "Total");

        Assert.Equal(expected, points[0].Value);
    }

    [Fact]
    public void Map_NullOrMissingValue_IsZero()
    {
        var rows = new List<IReadOnlyDictionary<string, object?>>
        {
            Row(("group", "A"), ("value", null)),
            Row(("group", "B"))
        };

        var points = FetchXmlResultMapper.Map(rows, "Total");

        Assert.Equal(0m, points[0].Value);
        Assert.Equal(0m, points[1].Value);
    }

    [Fact]
    public void Map_EmptyRows_ReturnsEmpty()
    {
        var points = FetchXmlResultMapper.Map([], "Total");

        Assert.Empty(points);
    }

    private static Dictionary<string, object?> Row(params (string Key, object? Value)[] pairs)
    {
        var row = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (key, value) in pairs)
        {
            row[key] = value;
        }

        return row;
    }
}
