using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class ReportQueryBuilderTests
{
    [Fact]
    public void Build_ProjectsColumnsAndAppliesRowLimit()
    {
        var definition = Report(rowLimit: 250, columns: [Column("qdb_name", 1), Column("qdb_amount", 2)]);

        var query = ReportQueryBuilder.Build(definition, new ReportExecutionRequest());

        Assert.Equal("qdb_loan_application", query.RootEntity);
        Assert.Contains("top=\"250\"", query.FetchXml);
        Assert.Contains("<attribute name=\"qdb_name\" alias=\"qdb_name\"", query.FetchXml);
        Assert.Equal(2, query.Columns.Count);
    }

    [Fact]
    public void Build_MapsEqualsFilterToFetchOperator()
    {
        var definition = Report(columns: [Column("qdb_name", 1)],
            filters: [Filter("statecode", "Equals", value: "0", sequence: 1)]);

        var query = ReportQueryBuilder.Build(definition, new ReportExecutionRequest());

        Assert.Contains("<filter type=\"and\">", query.FetchXml);
        Assert.Contains("attribute=\"statecode\" operator=\"eq\" value=\"0\"", query.FetchXml);
    }

    [Fact]
    public void Build_WrapsContainsFilterWithWildcards()
    {
        var definition = Report(columns: [Column("qdb_name", 1)],
            filters: [Filter("qdb_name", "Contains", value: "loan", sequence: 1)]);

        var query = ReportQueryBuilder.Build(definition, new ReportExecutionRequest());

        Assert.Contains("operator=\"like\" value=\"%loan%\"", query.FetchXml);
    }

    [Fact]
    public void Build_ValuelessOperatorEmitsNoValue()
    {
        var definition = Report(columns: [Column("qdb_name", 1)],
            filters: [Filter("qdb_closedon", "IsNull", value: null, sequence: 1)]);

        var query = ReportQueryBuilder.Build(definition, new ReportExecutionRequest());

        Assert.Contains("attribute=\"qdb_closedon\" operator=\"null\"", query.FetchXml);
        Assert.DoesNotContain("operator=\"null\" value=", query.FetchXml);
    }

    [Fact]
    public void Build_RuntimePromptFilter_UsesSuppliedParameterValue()
    {
        var definition = Report(columns: [Column("qdb_name", 1)],
            filters: [FilterPrompt("qdb_branchid", "Equals", parameterName: "branch", sequence: 1)]);
        var request = new ReportExecutionRequest
        {
            ParameterValues = new Dictionary<string, string?> { ["branch"] = "doha-main" }
        };

        var query = ReportQueryBuilder.Build(definition, request);

        Assert.Contains("attribute=\"qdb_branchid\" operator=\"eq\" value=\"doha-main\"", query.FetchXml);
    }

    [Fact]
    public void Build_RuntimePromptFilter_MissingValueDropsCondition()
    {
        var definition = Report(columns: [Column("qdb_name", 1)],
            filters: [FilterPrompt("qdb_branchid", "Equals", parameterName: "branch", sequence: 1)]);

        var query = ReportQueryBuilder.Build(definition, new ReportExecutionRequest());

        Assert.DoesNotContain("<filter", query.FetchXml); // no value, no default → no condition, no filter
    }

    private static ReportDefinition Report(
        IReadOnlyList<ReportColumn> columns, IReadOnlyList<ReportFilter>? filters = null, int? rowLimit = null) => new()
    {
        Id = Guid.NewGuid(),
        Name = "Test",
        MainEntityLogicalName = "qdb_loan_application",
        RowLimit = rowLimit,
        DataSources =
        [
            new ReportDataSource
            {
                Id = Guid.NewGuid(),
                EntityMappings =
                [
                    new ReportEntityMapping { Id = Guid.NewGuid(), EntityLogicalName = "qdb_loan_application", Columns = columns }
                ]
            }
        ],
        Filters = filters ?? []
    };

    private static ReportColumn Column(string logical, int sort) =>
        new() { Id = Guid.NewGuid(), ColumnLogicalName = logical, SortOrder = sort, IsVisible = true };

    private static ReportFilter Filter(string field, string op, string? value, int sequence) => new()
    {
        Id = Guid.NewGuid(),
        FieldAlias = field,
        Operator = new CodedValue(null, op),
        Value = value,
        Sequence = sequence,
        IsRuntimePrompt = false
    };

    private static ReportFilter FilterPrompt(string field, string op, string parameterName, int sequence) => new()
    {
        Id = Guid.NewGuid(),
        FieldAlias = field,
        Operator = new CodedValue(null, op),
        Value = parameterName,
        Sequence = sequence,
        IsRuntimePrompt = true
    };
}
