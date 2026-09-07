using Microsoft.Extensions.Options;
using Qdb.ReportEngine.Core.Configuration;
using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dashboards;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class WidgetQueryPlannerTests
{
    private static DashboardDefinition Dashboard(params DashboardWidget[] widgets) => new()
    {
        Id = Guid.NewGuid(),
        Title = "T",
        Sections = [new DashboardSection { Id = Guid.NewGuid(), Widgets = widgets }]
    };

    private static DashboardWidget Widget(string entity) => new()
    {
        Id = Guid.NewGuid(), Kind = WidgetKind.Metric, Entity = entity
    };

    [Fact]
    public void Plan_GroupingEnabled_CollapsesSameEntityWidgetsIntoOneGroup()
    {
        var planner = new WidgetQueryPlanner(Options.Create(new DashboardOptions { GroupSameEntityQueries = true }));
        var dashboard = Dashboard(Widget("qdb_loanapplication"), Widget("qdb_loanapplication"), Widget("qdb_facility"));

        var groups = planner.Plan(dashboard);

        Assert.Equal(2, groups.Count);
        Assert.Equal(2, groups.Single(g => g.Entity == "qdb_loanapplication").Widgets.Count);
        Assert.Single(groups.Single(g => g.Entity == "qdb_facility").Widgets);
    }

    [Fact]
    public void Plan_GroupingDisabled_ProducesOneGroupPerWidget()
    {
        var planner = new WidgetQueryPlanner(Options.Create(new DashboardOptions { GroupSameEntityQueries = false }));
        var dashboard = Dashboard(Widget("qdb_loanapplication"), Widget("qdb_loanapplication"));

        var groups = planner.Plan(dashboard);

        Assert.Equal(2, groups.Count);
        Assert.All(groups, g => Assert.Single(g.Widgets));
    }
}
