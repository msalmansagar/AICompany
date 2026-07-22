using Microsoft.Extensions.Logging.Abstractions;
using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class ReportDefinitionWriterTests
{
    [Fact]
    public async Task CreateAsync_WritesDefinitionThenSourceMappingColumns_ThenReportChildren_BoundToParents()
    {
        var connection = new RecordingConnection(Guid.Empty);
        var sut = new ReportDefinitionWriter(new RecordingConnectionFactory(connection), NullLogger<ReportDefinitionWriter>.Instance);

        var result = await sut.CreateAsync(SampleReport(), Context(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(connection.IdOf(0), result.Value);

        // Dependency order: definition → data source → entity mapping → columns → filter/parameter/layout.
        Assert.Equal("qdb_reportdefinition", connection.Created[0].Entity);
        Assert.Equal("Overdue Facilities", connection.Created[0].Attributes["qdb_name"]);

        Assert.Equal("qdb_reportdatasource", connection.Created[1].Entity);
        Assert.Equal($"/qdb_reportdefinitions({connection.IdOf(0)})", connection.Created[1].Attributes["Qdb_reportdefinitionid@odata.bind"]);

        Assert.Equal("qdb_reportentitymapping", connection.Created[2].Entity);
        Assert.Equal($"/qdb_reportdatasources({connection.IdOf(1)})", connection.Created[2].Attributes["Qdb_reportdatasourceid@odata.bind"]);

        Assert.Equal("qdb_reportcolumn", connection.Created[3].Entity);
        Assert.Equal($"/qdb_reportentitymappings({connection.IdOf(2)})", connection.Created[3].Attributes["Qdb_reportentitymappingid@odata.bind"]);
        Assert.Equal("qdb_reportcolumn", connection.Created[4].Entity);

        Assert.Equal("qdb_reportfilter", connection.Created[5].Entity);
        Assert.Equal("qdb_reportparameter", connection.Created[6].Entity);
        Assert.Equal("qdb_reportlayout", connection.Created[7].Entity);
    }

    [Fact]
    public async Task CreateAsync_WritesOptionSetCodes_ForFilterOperator()
    {
        var connection = new RecordingConnection(Guid.Empty);
        var sut = new ReportDefinitionWriter(new RecordingConnectionFactory(connection), NullLogger<ReportDefinitionWriter>.Instance);

        await sut.CreateAsync(SampleReport(), Context(), CancellationToken.None);

        var filter = connection.Created.Single(r => r.Entity == "qdb_reportfilter");
        Assert.Equal(100000000, filter.Attributes["qdb_operator"]);
        Assert.Equal("0", filter.Attributes["qdb_value"]);
    }

    private static ReportDefinition SampleReport() => new()
    {
        Id = Guid.NewGuid(),
        Name = "Overdue Facilities",
        MainEntityLogicalName = "account",
        DataSources =
        [
            new ReportDataSource
            {
                Id = Guid.NewGuid(),
                Name = "Primary source",
                IsPrimary = true,
                SourceAlias = "a",
                EntityMappings =
                [
                    new ReportEntityMapping
                    {
                        Id = Guid.NewGuid(),
                        EntityLogicalName = "account",
                        EntityAlias = "a",
                        Columns =
                        [
                            new ReportColumn { Id = Guid.NewGuid(), ColumnLogicalName = "name", OutputAlias = "name", SortOrder = 1, IsVisible = true },
                            new ReportColumn { Id = Guid.NewGuid(), ColumnLogicalName = "accountnumber", OutputAlias = "accountnumber", SortOrder = 2, IsVisible = true }
                        ]
                    }
                ]
            }
        ],
        Filters =
        [
            new ReportFilter { Id = Guid.NewGuid(), FieldAlias = "statecode", Operator = new CodedValue(100000000, "Equals"), Value = "0", Sequence = 1 }
        ],
        Parameters =
        [
            new ReportParameter { Id = Guid.NewGuid(), ParameterName = "branch", Label = "Branch", DisplayOrder = 1 }
        ],
        Layout = new ReportLayout { Id = Guid.NewGuid(), LayoutJson = "{\"type\":\"table\"}", ThemeColor = "#0078d4" }
    };

    private static ReportExecutionContext Context() => new()
    {
        UserId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
        RoleSetHash = "test"
    };
}
