using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class DrilldownPlannerTests
{
    private static readonly Guid RelId = Guid.Parse("dddddddd-0000-0000-0000-000000000001");

    [Fact]
    public void BuildChildDefinition_TargetsChildEntityFilteredByParentKey()
    {
        var definition = ReportWithChild();

        var result = DrilldownPlanner.BuildChildDefinition(definition, Relationship("con", "parentcustomerid"), "acc-123");

        Assert.True(result.IsSuccess);
        var child = result.Value;
        Assert.Equal("contact", child.MainEntityLogicalName);
        Assert.Equal("fullname", child.DataSources[0].EntityMappings[0].Columns.Single().ColumnLogicalName);
        var filter = Assert.Single(child.Filters);
        Assert.Equal("parentcustomerid", filter.FieldAlias);
        Assert.Equal("acc-123", filter.Value);
        Assert.Equal("Equals", filter.Operator?.Label);
    }

    [Fact]
    public void BuildChildDefinition_ChildAliasWithoutMapping_Fails()
    {
        var result = DrilldownPlanner.BuildChildDefinition(ReportWithChild(), Relationship("missing", "parentcustomerid"), "acc-123");

        Assert.False(result.IsSuccess);
        Assert.Equal("not_found", result.Error!.Code);
    }

    private static ReportDefinition ReportWithChild() => new()
    {
        Id = Guid.NewGuid(),
        Name = "Accounts",
        MainEntityLogicalName = "account",
        DataSources =
        [
            new ReportDataSource
            {
                Id = Guid.NewGuid(),
                EntityMappings =
                [
                    new ReportEntityMapping { Id = Guid.NewGuid(), EntityLogicalName = "account", EntityAlias = "acc" },
                    new ReportEntityMapping
                    {
                        Id = Guid.NewGuid(), EntityLogicalName = "contact", EntityAlias = "con",
                        Columns = [new ReportColumn { Id = Guid.NewGuid(), ColumnLogicalName = "fullname" }]
                    }
                ]
            }
        ],
        Relationships = [Relationship("con", "parentcustomerid")]
    };

    private static ReportRelationship Relationship(string childAlias, string childKey) => new()
    {
        Id = RelId,
        RelationshipType = new CodedValue(null, "1:N"),
        ParentAlias = "acc",
        ParentKey = "accountid",
        ChildAlias = childAlias,
        ChildKey = childKey
    };
}
