using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

/// <summary>
/// A grouped report reading through a saved view. These cover the ways it can return something that
/// looks like data and is not: the grouping dropped, the view's row selection lost with it, or an
/// aggregate fetch built with the parts FetchXML rejects.
/// </summary>
public sealed class FetchXmlAggregatesTests
{
    private const string View =
        "<fetch top=\"50\"><entity name=\"account\">"
        + "<attribute name=\"name\" /><order attribute=\"name\" descending=\"false\" />"
        + "<filter type=\"and\"><condition attribute=\"statecode\" operator=\"eq\" value=\"0\" /></filter>"
        + "<link-entity name=\"contact\" from=\"contactid\" to=\"primarycontactid\" alias=\"pc\">"
        + "<attribute name=\"emailaddress1\" /></link-entity>"
        + "</entity></fetch>";

    private const string GroupedByCity =
        "<fetch aggregate=\"true\"><entity name=\"account\">"
        + "<attribute name=\"address1_city\" alias=\"address1_city\" groupby=\"true\" />"
        + "<attribute name=\"accountid\" alias=\"accountid\" aggregate=\"count\" />"
        + "<order alias=\"address1_city\" /></entity></fetch>";

    [Fact]
    public void ApplyTo_GroupsTheViewsRows_RatherThanListingThem()
    {
        var merged = FetchXmlAggregates.ApplyTo(View, GroupedByCity)!;

        Assert.Contains("aggregate=\"true\"", merged);
        Assert.Contains("groupby=\"true\"", merged);
        Assert.Contains("aggregate=\"count\"", merged);
    }

    [Fact]
    public void ApplyTo_KeepsTheViewsFilter_SoItStillSelectsTheSameRows()
    {
        // The view defines which rows are counted. Losing its filter would count the wrong ones and
        // still return a plausible number.
        var merged = FetchXmlAggregates.ApplyTo(View, GroupedByCity)!;

        Assert.Contains("statecode", merged);
    }

    [Fact]
    public void ApplyTo_DropsTheViewsOwnProjectionAndOrder()
    {
        // FetchXML rejects an ungrouped attribute in an aggregate query, and an order naming an
        // attribute rather than an alias — the view carries both.
        var merged = FetchXmlAggregates.ApplyTo(View, GroupedByCity)!;

        Assert.DoesNotContain("<attribute name=\"name\"", merged);
        Assert.DoesNotContain("order attribute=", merged);
        Assert.DoesNotContain("emailaddress1", merged);
    }

    [Fact]
    public void ApplyTo_RemovesTop_WhichAnAggregateFetchRejects()
    {
        var merged = FetchXmlAggregates.ApplyTo(View, GroupedByCity)!;

        Assert.DoesNotContain("top=", merged);
    }

    [Fact]
    public void ApplyTo_KeepsTheViewsJoin_BecauseItDecidesWhichRowsExist()
    {
        // Stripping the link would widen the count past what the view returns.
        var merged = FetchXmlAggregates.ApplyTo(View, GroupedByCity)!;

        Assert.Contains("link-entity", merged);
    }

    [Fact]
    public void ApplyTo_RefusesToGroupAColumnTheViewJoinedIn()
    {
        // "pc.emailaddress1" is not an attribute name the root entity can group by, and nothing says
        // which link it belongs to. Refused rather than silently dropped from the grouping.
        var groupedByLinked =
            "<fetch aggregate=\"true\"><entity name=\"account\">"
            + "<attribute name=\"emailaddress1\" alias=\"pc.emailaddress1\" groupby=\"true\" />"
            + "<attribute name=\"accountid\" alias=\"accountid\" aggregate=\"count\" />"
            + "</entity></fetch>";

        Assert.Null(FetchXmlAggregates.ApplyTo(View, groupedByLinked));
        Assert.False(FetchXmlAggregates.CanApplyTo(groupedByLinked));
    }

    [Fact]
    public void ApplyTo_WhenTheViewsQueryCannotBeParsed_RefusesRatherThanGuessing()
    {
        Assert.Null(FetchXmlAggregates.ApplyTo("not xml", GroupedByCity));
    }
}
