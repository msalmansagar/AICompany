using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class FetchXmlAggregateBuilderTests
{
    [Fact]
    public void Build_SumMeasureWithGroupBy_EmitsAggregateAndGroupBy()
    {
        var widget = new DashboardWidget
        {
            Id = Guid.NewGuid(),
            Kind = WidgetKind.Chart,
            Entity = "qdb_loanapplication",
            GroupByAttribute = "qdb_branchid",
            MeasureAttribute = "qdb_requestedamount",
            Aggregation = Aggregation.Sum
        };

        var xml = FetchXmlAggregateBuilder.Build(widget);

        Assert.Contains("aggregate=\"true\"", xml);
        Assert.Contains("name=\"qdb_requestedamount\"", xml);
        Assert.Contains("aggregate=\"sum\"", xml);
        Assert.Contains("name=\"qdb_branchid\"", xml);
        Assert.Contains("groupby=\"true\"", xml);
    }

    [Fact]
    public void Build_CountWithoutMeasure_CountsPrimaryKey()
    {
        var widget = new DashboardWidget
        {
            Id = Guid.NewGuid(),
            Kind = WidgetKind.Metric,
            Entity = "qdb_loanapplication",
            Aggregation = Aggregation.Count
        };

        var xml = FetchXmlAggregateBuilder.Build(widget);

        Assert.Contains("name=\"qdb_loanapplicationid\"", xml);
        Assert.Contains("aggregate=\"count\"", xml);
        Assert.DoesNotContain("groupby=\"true\"", xml);
    }

    [Theory]
    [InlineData(Aggregation.Average, "avg")]
    [InlineData(Aggregation.Max, "max")]
    [InlineData(Aggregation.Min, "min")]
    public void Build_MapsAggregationToFetchXmlKeyword(Aggregation aggregation, string expected)
    {
        var widget = new DashboardWidget
        {
            Id = Guid.NewGuid(),
            Kind = WidgetKind.Metric,
            Entity = "qdb_facility",
            MeasureAttribute = "qdb_outstanding",
            Aggregation = aggregation
        };

        var xml = FetchXmlAggregateBuilder.Build(widget);

        Assert.Contains($"aggregate=\"{expected}\"", xml);
    }
}
