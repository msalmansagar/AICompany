using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class ReportRowShaperTests
{
    private static readonly IReadOnlyList<ReportResultColumn> Columns =
    [
        new() { Alias = "qdb_name", Attribute = "qdb_name" },
        new() { Alias = "statecode", Attribute = "statecode" },
        new() { Alias = "qdb_branchid", Attribute = "qdb_branchid" }
    ];

    [Fact]
    public void Shape_AlignsCellsToColumnsWithRawAndFormatted()
    {
        var raw = new List<IReadOnlyDictionary<string, object?>>
        {
            Row(("qdb_name", "Acme"),
                ("statecode", 0L), ("statecode@OData.Community.Display.V1.FormattedValue", "Active"))
        };

        var rows = ReportRowShaper.Shape(Columns, raw);

        var row = Assert.Single(rows);
        Assert.Equal("Acme", row.Cells["qdb_name"].Value);
        Assert.Equal(0L, row.Cells["statecode"].Value);
        Assert.Equal("Active", row.Cells["statecode"].Text); // formatted label preferred
    }

    [Fact]
    public void Shape_ResolvesLookupInValueForm()
    {
        var raw = new List<IReadOnlyDictionary<string, object?>>
        {
            Row(("_qdb_branchid_value", "b1000000-0000-0000-0000-000000000001"),
                ("_qdb_branchid_value@OData.Community.Display.V1.FormattedValue", "Doha Main"))
        };

        var rows = ReportRowShaper.Shape(Columns, raw);

        Assert.Equal("Doha Main", rows[0].Cells["qdb_branchid"].Text);
    }

    [Fact]
    public void Shape_MissingAttribute_YieldsNullCell()
    {
        var rows = ReportRowShaper.Shape(Columns, [Row(("qdb_name", "Acme"))]);

        Assert.Null(rows[0].Cells["statecode"].Value);
        Assert.Null(rows[0].Cells["statecode"].Text);
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
