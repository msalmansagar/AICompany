using Microsoft.Extensions.Logging.Abstractions;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class ReportDefinitionWriterTests
{
    private static ReportDefinitionWriter BuildWriter(RecordingConnection connection, Result<ReportDefinition>? existing = null)
    {
        var loader = new FakeReportDefinitionLoader(existing ?? Result<ReportDefinition>.Failure(DomainError.NotFound("qdb_reportdefinition")));
        return new ReportDefinitionWriter(new RecordingConnectionFactory(connection), loader, NullLogger<ReportDefinitionWriter>.Instance);
    }

    [Fact]
    public async Task CreateAsync_WritesDefinitionThenSourceMappingColumns_ThenReportChildren_BoundToParents()
    {
        var connection = new RecordingConnection(Guid.Empty);
        var sut = BuildWriter(connection);

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
        var sut = BuildWriter(connection);

        await sut.CreateAsync(SampleReport(), Context(), CancellationToken.None);

        var filter = connection.Created.Single(r => r.Entity == "qdb_reportfilter");
        Assert.Equal(100000000, filter.Attributes["qdb_operator"]);
        Assert.Equal("0", filter.Attributes["qdb_value"]);
    }

    [Fact]
    public async Task UpdateAsync_DeletesExistingChildren_UpdatesDefinition_AndRecreatesChildren()
    {
        var reportId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var existing = ExistingReport(reportId, out var oldColumnId, out var oldMappingId, out var oldSourceId, out var oldFilterId);
        var connection = new RecordingConnection(Guid.Empty);
        var sut = BuildWriter(connection, Result<ReportDefinition>.Success(existing));

        var result = await sut.UpdateAsync(reportId, SampleReport(), Context(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(reportId, result.Value);
        // Children deleted leaf-first: column → mapping → data source, then the filter.
        Assert.Equal(("qdb_reportcolumn", oldColumnId), connection.Deleted[0]);
        Assert.Equal(("qdb_reportentitymapping", oldMappingId), connection.Deleted[1]);
        Assert.Equal(("qdb_reportdatasource", oldSourceId), connection.Deleted[2]);
        Assert.Contains(("qdb_reportfilter", oldFilterId), connection.Deleted);
        // Definition patched, not recreated.
        Assert.Equal(("qdb_reportdefinition", reportId), Assert.Single(connection.Updated));
        // New children recreated.
        Assert.Contains(connection.Created, r => r.Entity == "qdb_reportdatasource");
        Assert.Contains(connection.Created, r => r.Entity == "qdb_reportcolumn");
    }

    [Fact]
    public async Task DeleteAsync_DeletesAllChildren_ThenDefinition()
    {
        var reportId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        var existing = ExistingReport(reportId, out _, out _, out _, out _);
        var connection = new RecordingConnection(Guid.Empty);
        var sut = BuildWriter(connection, Result<ReportDefinition>.Success(existing));

        var result = await sut.DeleteAsync(reportId, Context(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(("qdb_reportdefinition", reportId), connection.Deleted[^1]);
        Assert.Empty(connection.Created);
    }

    [Fact]
    public async Task UpdateAsync_WhenReportNotFound_ReturnsThatError_AndWritesNothing()
    {
        var connection = new RecordingConnection(Guid.Empty);
        var sut = BuildWriter(connection, Result<ReportDefinition>.Failure(DomainError.NotFound("qdb_reportdefinition")));

        var result = await sut.UpdateAsync(Guid.NewGuid(), SampleReport(), Context(), CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("not_found", result.Error!.Code);
        Assert.Empty(connection.Deleted);
        Assert.Empty(connection.Created);
    }

    private static ReportDefinition ExistingReport(Guid id, out Guid columnId, out Guid mappingId, out Guid sourceId, out Guid filterId)
    {
        columnId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
        mappingId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000002");
        sourceId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000003");
        filterId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000004");
        return new ReportDefinition
        {
            Id = id,
            Name = "Old report",
            DataSources =
            [
                new ReportDataSource
                {
                    Id = sourceId,
                    EntityMappings =
                    [
                        new ReportEntityMapping
                        {
                            Id = mappingId,
                            Columns = [new ReportColumn { Id = columnId, ColumnLogicalName = "name" }]
                        }
                    ]
                }
            ],
            Filters = [new ReportFilter { Id = filterId, FieldAlias = "statecode" }]
        };
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
