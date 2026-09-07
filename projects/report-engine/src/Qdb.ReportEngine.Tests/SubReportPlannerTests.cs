using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class SubReportPlannerTests
{
    [Fact]
    public void ScopeToParent_AppendsChildKeyEqualsParentKeyFilter()
    {
        var subReport = SubReport(existingFilters: 1);

        var scoped = SubReportPlanner.ScopeToParent(subReport, "parentcustomerid", "acc-1");

        Assert.Equal(2, scoped.Filters.Count);
        var added = scoped.Filters.Single(f => f.FieldAlias == "parentcustomerid");
        Assert.Equal("acc-1", added.Value);
        Assert.Equal("Equals", added.Operator?.Label);
        Assert.Equal(2, added.Sequence); // after the existing filter (sequence 1)
    }

    [Fact]
    public void ScopeToParent_NoChildKey_ReturnsUnchanged()
    {
        var subReport = SubReport(existingFilters: 1);

        var scoped = SubReportPlanner.ScopeToParent(subReport, null, "acc-1");

        Assert.Same(subReport, scoped);
    }

    private static ReportDefinition SubReport(int existingFilters) => new()
    {
        Id = Guid.NewGuid(),
        Name = "Contacts",
        MainEntityLogicalName = "contact",
        Filters = Enumerable.Range(1, existingFilters)
            .Select(i => new ReportFilter { Id = Guid.NewGuid(), FieldAlias = $"f{i}", Sequence = i })
            .ToList()
    };
}
