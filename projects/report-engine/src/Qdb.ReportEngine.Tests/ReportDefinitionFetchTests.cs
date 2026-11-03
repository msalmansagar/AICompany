using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class ReportDefinitionFetchTests
{
    private static readonly Guid ReportId = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    [Fact]
    public void Definition_FiltersByIdAndSelectsKeyAttributes()
    {
        var fetch = ReportDefinitionFetch.Definition(ReportId);

        Assert.Contains("<entity name=\"qdb_reportdefinition\">", fetch);
        Assert.Contains("top=\"1\"", fetch);
        Assert.Contains($"operator=\"eq\" value=\"{ReportId}\"", fetch);
        Assert.Contains("name=\"qdb_reportcode\"", fetch);
    }

    [Fact]
    public void EntityMappings_ReachesReportThroughDataSourceLink()
    {
        var fetch = ReportDefinitionFetch.EntityMappings(ReportId);

        Assert.Contains("<entity name=\"qdb_reportentitymapping\">", fetch);
        Assert.Contains("<link-entity name=\"qdb_reportdatasource\"", fetch);
        Assert.Contains($"attribute=\"qdb_reportdefinitionid\" operator=\"eq\" value=\"{ReportId}\"", fetch);
    }

    [Fact]
    public void Columns_ReachesReportThroughMappingThenDataSource()
    {
        var fetch = ReportDefinitionFetch.Columns(ReportId);

        Assert.Contains("<entity name=\"qdb_reportcolumn\">", fetch);
        Assert.Contains("<link-entity name=\"qdb_reportentitymapping\"", fetch);
        Assert.Contains("<link-entity name=\"qdb_reportdatasource\"", fetch);
        Assert.Contains($"value=\"{ReportId}\"", fetch);
    }
}
