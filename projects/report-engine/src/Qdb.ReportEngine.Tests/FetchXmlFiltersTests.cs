using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

/// <summary>
/// A view supplies the query, and the report still says which rows it wants. These cover the ways
/// that combination can go wrong: filters dropped, the view's own filter overwritten, or a condition
/// lifted out of a join and applied to the wrong table.
/// </summary>
public sealed class FetchXmlFiltersTests
{
    private const string ViewWithOwnFilter =
        "<fetch><entity name=\"account\"><attribute name=\"name\" />"
        + "<filter type=\"and\"><condition attribute=\"statecode\" operator=\"eq\" value=\"0\" /></filter>"
        + "</entity></fetch>";

    [Fact]
    public void ApplyTo_AddsTheReportsFilter_SoNarrowingAViewBackedReportWorks()
    {
        var generated = "<fetch><entity name=\"account\">"
            + "<filter type=\"and\"><condition attribute=\"address1_city\" operator=\"eq\" value=\"Doha\" /></filter>"
            + "</entity></fetch>";

        var merged = FetchXmlFilters.ApplyTo(ViewWithOwnFilter, generated);

        Assert.Contains("address1_city", merged);
    }

    [Fact]
    public void ApplyTo_KeepsTheViewsOwnFilter()
    {
        // Appended, not merged: the view goes on narrowing what it narrowed, and the report narrows
        // further. Replacing its filter would quietly widen the report beyond what the view means.
        var generated = "<fetch><entity name=\"account\">"
            + "<filter type=\"and\"><condition attribute=\"address1_city\" operator=\"eq\" value=\"Doha\" /></filter>"
            + "</entity></fetch>";

        var merged = FetchXmlFilters.ApplyTo(ViewWithOwnFilter, generated);

        Assert.Contains("statecode", merged);
        Assert.Equal(2, System.Text.RegularExpressions.Regex.Matches(merged, "<filter").Count);
    }

    [Fact]
    public void ApplyTo_WithNoReportFilters_LeavesTheViewExactlyAsItWas()
    {
        var generated = "<fetch><entity name=\"account\"><attribute name=\"name\" /></entity></fetch>";

        Assert.Equal(ViewWithOwnFilter, FetchXmlFilters.ApplyTo(ViewWithOwnFilter, generated));
    }

    [Fact]
    public void ApplyTo_LeavesAJoinsFilterWhereItIs()
    {
        // A condition inside a link-entity belongs to a join the view does not have. Hoisting it to
        // the root would filter the primary table on a field of another one.
        var generated = "<fetch><entity name=\"account\">"
            + "<link-entity name=\"contact\" from=\"parentcustomerid\" to=\"accountid\">"
            + "<filter type=\"and\"><condition attribute=\"emailaddress1\" operator=\"not-null\" /></filter>"
            + "</link-entity></entity></fetch>";

        Assert.Equal(ViewWithOwnFilter, FetchXmlFilters.ApplyTo(ViewWithOwnFilter, generated));
    }

    [Fact]
    public void ApplyTo_WhenTheViewsQueryCannotBeParsed_ReturnsItUntouched()
    {
        var generated = "<fetch><entity name=\"account\">"
            + "<filter type=\"and\"><condition attribute=\"name\" operator=\"eq\" value=\"x\" /></filter>"
            + "</entity></fetch>";

        Assert.Equal("not xml", FetchXmlFilters.ApplyTo("not xml", generated));
    }

    [Fact]
    public void ApplyTo_CarriesAParameterDrivenFilter_SoAnsweringThePromptChangesTheRows()
    {
        // Filters are the only consumer of parameter values, so this is the whole of what a runtime
        // prompt does. If it does not reach the query, the prompt is decoration.
        var definition = ReportWithPromptedFilter();
        var request = new ReportExecutionRequest
        {
            ParameterValues = new Dictionary<string, string?> { ["City"] = "Doha" }
        };

        var generated = ReportQueryBuilder.Build(definition, request).FetchXml;
        var merged = FetchXmlFilters.ApplyTo(ViewWithOwnFilter, generated);

        Assert.Contains("Doha", merged);
    }

    private static ReportDefinition ReportWithPromptedFilter() => new()
    {
        Id = Guid.NewGuid(),
        Name = "Accounts by city",
        MainEntityLogicalName = "account",
        RowLimit = 100,
        Filters =
        [
            new ReportFilter
            {
                Id = Guid.NewGuid(),
                FieldAlias = "address1_city",
                Operator = new CodedValue(null, "Equals"),
                Value = "City",
                IsRuntimePrompt = true,
                Sequence = 1
            }
        ],
        DataSources =
        [
            new ReportDataSource
            {
                Id = Guid.NewGuid(),
                IsPrimary = true,
                EntityMappings =
                [
                    new ReportEntityMapping
                    {
                        Id = Guid.NewGuid(),
                        EntityLogicalName = "account",
                        Columns = [new ReportColumn { Id = Guid.NewGuid(), ColumnLogicalName = "name", SortOrder = 1, IsVisible = true }]
                    }
                ]
            }
        ]
    };
}
