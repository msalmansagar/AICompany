using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class ReportTransformationPipelineTests
{
    [Fact]
    public void RenameColumns_ChangesLabelByAlias()
    {
        var transforms = new[] { Transform("RenameColumns", """{"renames":{"statecode":"Status"}}""", 1) };

        var result = ReportTransformationPipeline.Apply(transforms, Sample());

        Assert.Equal("Status", result.Columns.Single(c => c.Alias == "statecode").Label);
        Assert.Equal("Name", result.Columns.Single(c => c.Alias == "name").Label); // untouched
    }

    [Fact]
    public void NullHandling_ReplacesBlankCellsWithDefault()
    {
        var transforms = new[] { Transform("NullHandling", """{"default":"N/A"}""", 1) };

        var result = ReportTransformationPipeline.Apply(transforms, Sample());

        Assert.Equal("N/A", result.Rows[1].Cells["phone"].Text); // was null
        Assert.Equal("111", result.Rows[0].Cells["phone"].Text);  // untouched
    }

    [Fact]
    public void Masking_KeepsLastNCharacters()
    {
        var transforms = new[] { Transform("Masking", """{"columns":["name"],"keepLast":2}""", 1) };

        var result = ReportTransformationPipeline.Apply(transforms, Sample());

        Assert.Equal("**me", result.Rows[0].Cells["name"].Text); // "Acme" (4) -> mask 2, keep "me"
    }

    [Fact]
    public void Apply_RunsInStepOrderAndSkipsDisabled()
    {
        var transforms = new[]
        {
            Transform("RenameColumns", """{"renames":{"name":"SECOND"}}""", 2),
            Transform("RenameColumns", """{"renames":{"name":"FIRST"}}""", 1),
            Transform("RenameColumns", """{"renames":{"name":"DISABLED"}}""", 3, enabled: false)
        };

        var result = ReportTransformationPipeline.Apply(transforms, Sample());

        Assert.Equal("SECOND", result.Columns.Single(c => c.Alias == "name").Label); // step 2 wins, disabled skipped
    }

    [Fact]
    public void Apply_UnknownTypeOrBadConfig_PassesThrough()
    {
        var transforms = new[]
        {
            Transform("Pivot", """{"anything":true}""", 1),      // unimplemented
            Transform("RenameColumns", "not json at all", 2)      // malformed
        };

        var result = ReportTransformationPipeline.Apply(transforms, Sample());

        Assert.Equal("Name", result.Columns.Single(c => c.Alias == "name").Label);
    }

    [Fact]
    public void NumberFormat_FormatsWithThousandsAndDecimals()
    {
        var transforms = new[] { Transform("NumberFormat", """{"columns":["amount"],"decimals":2,"thousands":true}""", 1) };

        var result = ReportTransformationPipeline.Apply(transforms, NumericSample());

        Assert.Equal("1,234,567.50", result.Rows[0].Cells["amount"].Text);
    }

    [Fact]
    public void CurrencyFormat_PrefixesSymbol()
    {
        var transforms = new[] { Transform("CurrencyFormat", """{"columns":["amount"],"symbol":"QAR"}""", 1) };

        var result = ReportTransformationPipeline.Apply(transforms, NumericSample());

        Assert.Equal("QAR 1,234,567.50", result.Rows[0].Cells["amount"].Text);
    }

    [Fact]
    public void DateFormat_ReformatsIsoDate()
    {
        var transforms = new[] { Transform("DateFormat", """{"columns":["created"],"format":"dd MMM yyyy"}""", 1) };

        var result = ReportTransformationPipeline.Apply(transforms, NumericSample());

        Assert.Equal("05 Mar 2026", result.Rows[0].Cells["created"].Text);
    }

    [Fact]
    public void Mapping_ReplacesValueByCode()
    {
        var transforms = new[] { Transform("Mapping", """{"column":"flag","map":{"0":"No","1":"Yes"},"default":"?"}""", 1) };

        var result = ReportTransformationPipeline.Apply(transforms, NumericSample());

        Assert.Equal("Yes", result.Rows[0].Cells["flag"].Text); // value 1
        Assert.Equal("?", result.Rows[1].Cells["flag"].Text);   // value 9 -> default
    }

    [Fact]
    public void MergeColumns_AddsCombinedColumn()
    {
        var transforms = new[] { Transform("MergeColumns", """{"columns":["first","last"],"into":"full","label":"Full","separator":" "}""", 1) };

        var result = ReportTransformationPipeline.Apply(transforms, MergeSample());

        Assert.Contains(result.Columns, c => c.Alias == "full" && c.Label == "Full");
        Assert.Equal("Ada Lovelace", result.Rows[0].Cells["full"].Text);
    }

    private static ReportResult NumericSample() => new()
    {
        ReportId = Guid.NewGuid(),
        ReportName = "Test",
        Columns =
        [
            new ReportResultColumn { Alias = "amount" },
            new ReportResultColumn { Alias = "created" },
            new ReportResultColumn { Alias = "flag" }
        ],
        Rows =
        [
            NumRow(1234567.5m, "2026-03-05T00:00:00Z", 1L),
            NumRow(10m, "2026-01-01T00:00:00Z", 9L)
        ]
    };

    private static ReportResultRow NumRow(decimal amount, string created, long flag) => new()
    {
        Cells = new Dictionary<string, ReportCell>(StringComparer.Ordinal)
        {
            ["amount"] = new ReportCell(amount, amount.ToString(System.Globalization.CultureInfo.InvariantCulture)),
            ["created"] = new ReportCell(created, created),
            ["flag"] = new ReportCell(flag, flag.ToString())
        }
    };

    private static ReportResult MergeSample() => new()
    {
        ReportId = Guid.NewGuid(),
        ReportName = "Test",
        Columns = [new ReportResultColumn { Alias = "first" }, new ReportResultColumn { Alias = "last" }],
        Rows = [Row(("first", "Ada"), ("last", "Lovelace"))]
    };

    private static ReportTransformation Transform(string type, string config, int step, bool enabled = true) => new()
    {
        Id = Guid.NewGuid(),
        TransformType = new CodedValue(null, type),
        ConfigJson = config,
        StepOrder = step,
        Enabled = enabled
    };

    private static ReportResult Sample() => new()
    {
        ReportId = Guid.NewGuid(),
        ReportName = "Test",
        Columns =
        [
            new ReportResultColumn { Alias = "name", Label = "Name" },
            new ReportResultColumn { Alias = "statecode", Label = "Status Code" },
            new ReportResultColumn { Alias = "phone", Label = "Phone" }
        ],
        Rows =
        [
            Row(("name", "Acme"), ("statecode", "Active"), ("phone", "111")),
            Row(("name", "Doha"), ("statecode", "Active"), ("phone", null))
        ]
    };

    private static ReportResultRow Row(params (string Alias, string? Text)[] cells) => new()
    {
        Cells = cells.ToDictionary(c => c.Alias, c => new ReportCell(c.Text, c.Text), StringComparer.Ordinal)
    };
}
