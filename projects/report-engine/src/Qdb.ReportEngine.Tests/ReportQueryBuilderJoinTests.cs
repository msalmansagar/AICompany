using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

/// <summary>
/// Multi-entity reports. Before this, every mapping other than the main entity was silently dropped,
/// so a report designed over "Accounts → Contacts" quietly returned accounts only.
/// </summary>
public sealed class ReportQueryBuilderJoinTests
{
    private const string Root = "account";

    [Fact]
    public void Build_EmitsLinkEntityForAJoinedMapping()
    {
        var query = ReportQueryBuilder.Build(JoinedReport(), new ReportExecutionRequest());

        Assert.Contains("<link-entity name=\"contact\"", query.FetchXml);
        Assert.Contains("from=\"parentcustomerid\"", query.FetchXml);
        Assert.Contains("to=\"accountid\"", query.FetchXml);
    }

    [Fact]
    public void Build_ProjectsColumnsFromBothEntities()
    {
        var query = ReportQueryBuilder.Build(JoinedReport(), new ReportExecutionRequest());

        Assert.Contains("<attribute name=\"name\" alias=\"name\"", query.FetchXml);
        Assert.Contains("<attribute name=\"fullname\" alias=\"fullname\"", query.FetchXml);
    }

    [Fact]
    public void Build_ReturnsResultColumnsForBothEntities()
    {
        var query = ReportQueryBuilder.Build(JoinedReport(), new ReportExecutionRequest());

        Assert.Equal(new[] { "name", "fullname" }, query.Columns.Select(c => c.Alias));
    }

    [Fact]
    public void Build_CarriesTheEntityAliasOntoTheLink()
    {
        var query = ReportQueryBuilder.Build(JoinedReport(), new ReportExecutionRequest());

        Assert.Contains("alias=\"con\"", query.FetchXml);
    }

    [Theory]
    [InlineData("Inner", "inner")]
    [InlineData("Left outer", "outer")]
    [InlineData("Right outer", "outer")]
    [InlineData(null, "outer")]
    public void Build_MapsJoinTypeToFetchLinkType(string? joinType, string expected)
    {
        var query = ReportQueryBuilder.Build(JoinedReport(joinType), new ReportExecutionRequest());

        Assert.Contains($"link-type=\"{expected}\"", query.FetchXml);
    }

    [Fact]
    public void Build_WithoutAJoinExpression_SkipsTheMappingRatherThanGuessing()
    {
        // An invented link would silently return the wrong rows, which is worse than omitting columns.
        var query = ReportQueryBuilder.Build(JoinedReport(joinJson: null), new ReportExecutionRequest());

        Assert.DoesNotContain("link-entity", query.FetchXml);
        Assert.Equal(new[] { "name" }, query.Columns.Select(c => c.Alias));
    }

    [Fact]
    public void Build_WithIncompleteJoinExpression_SkipsTheMapping()
    {
        var query = ReportQueryBuilder.Build(JoinedReport(joinJson: "{\"from\":\"parentcustomerid\"}"), new ReportExecutionRequest());

        Assert.DoesNotContain("link-entity", query.FetchXml);
    }

    [Fact]
    public void Build_AggregatesAcrossTheJoin()
    {
        var definition = JoinedReport(childColumns:
        [
            new ReportColumn
            {
                Id = Guid.NewGuid(), ColumnLogicalName = "contactid", SortOrder = 2, IsVisible = true,
                AggregateFunction = new CodedValue(null, "Count")
            }
        ]);

        var query = ReportQueryBuilder.Build(definition, new ReportExecutionRequest());

        Assert.Contains("aggregate=\"true\"", query.FetchXml);
        Assert.Contains("aggregate=\"count\"", query.FetchXml);
        Assert.Contains("groupby=\"true\"", query.FetchXml);   // the root column groups
        Assert.Contains("<link-entity name=\"contact\"", query.FetchXml);
    }

    [Fact]
    public void Build_KeepsRootFallbackWhenThereAreNoJoins()
    {
        // A definition whose main entity matches no mapping still projects the columns it has.
        var definition = JoinedReport(joinJson: null) with { MainEntityLogicalName = "nonexistent" };

        var query = ReportQueryBuilder.Build(definition, new ReportExecutionRequest());

        Assert.NotEmpty(query.Columns);
    }

    private static ReportDefinition JoinedReport(
        string? joinType = "Inner",
        string? joinJson = "{\"from\":\"parentcustomerid\",\"to\":\"accountid\"}",
        IReadOnlyList<ReportColumn>? childColumns = null) => new()
    {
        Id = Guid.NewGuid(),
        Name = "Accounts with contacts",
        MainEntityLogicalName = Root,
        DataSources =
        [
            new ReportDataSource
            {
                Id = Guid.NewGuid(),
                EntityMappings =
                [
                    new ReportEntityMapping
                    {
                        Id = Guid.NewGuid(), EntityLogicalName = Root, EntityAlias = "acc", Depth = 0,
                        Columns = [Column("name", 1)]
                    },
                    new ReportEntityMapping
                    {
                        Id = Guid.NewGuid(), EntityLogicalName = "contact", EntityAlias = "con", Depth = 1,
                        JoinType = joinType is null ? null : new CodedValue(null, joinType),
                        JoinExpressionJson = joinJson,
                        Columns = childColumns ?? [Column("fullname", 2)]
                    }
                ]
            }
        ],
        Filters = []
    };

    private static ReportColumn Column(string logical, int sort) =>
        new() { Id = Guid.NewGuid(), ColumnLogicalName = logical, SortOrder = sort, IsVisible = true };
}
