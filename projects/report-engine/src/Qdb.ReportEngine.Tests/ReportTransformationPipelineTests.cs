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
