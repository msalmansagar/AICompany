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

    [Fact]
    public void Build_AggregateColumns_EmitsAggregateFetchWithGroupByAndNoTop()
    {
        var definition = Report(columns:
        [
            GroupColumn("statecode", groupOrder: 1),
            MeasureColumn("accountid", "Count", sort: 2)
        ]);

        var query = ReportQueryBuilder.Build(definition, new ReportExecutionRequest());

        Assert.True(query.IsAggregate);
        Assert.Contains("<fetch aggregate=\"true\">", query.FetchXml);
        Assert.DoesNotContain("top=", query.FetchXml);
        Assert.Contains("name=\"statecode\" alias=\"statecode\" groupby=\"true\"", query.FetchXml);
        Assert.Contains("name=\"accountid\" alias=\"accountid\" aggregate=\"count\"", query.FetchXml);
        Assert.Contains("<order alias=\"statecode\"", query.FetchXml);
    }

    [Fact]
    public void Build_NoAggregateFunction_StaysProjection()
    {
        var query = ReportQueryBuilder.Build(Report(columns: [Column("name", 1)]), new ReportExecutionRequest());

        Assert.False(query.IsAggregate);
        Assert.Contains("top=", query.FetchXml);
    }

    private static ReportColumn GroupColumn(string logical, int groupOrder) => new()
    {
        Id = Guid.NewGuid(),
        ColumnLogicalName = logical,
        GroupOrder = groupOrder,
        AggregateFunction = new CodedValue(null, "None"),
        IsVisible = true
    };

    private static ReportColumn MeasureColumn(string logical, string aggregate, int sort) => new()
    {
        Id = Guid.NewGuid(),
        ColumnLogicalName = logical,
        SortOrder = sort,
        AggregateFunction = new CodedValue(null, aggregate),
        IsVisible = true
    };

    /// <summary>
    /// A report whose second source is standalone. Its mapping names a different entity, so if the
    /// builder still flattened it the root query would gain a link-entity and the block would also
    /// render on its own — the same rows twice, in two places.
    /// </summary>
    private static ReportDefinition ReportWithSecondSource(string composition) => new()
    {
        Id = Guid.NewGuid(),
        Name = "Two sources",
        MainEntityLogicalName = "qdb_loan_application",
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
                        EntityLogicalName = "qdb_loan_application",
                        Columns = [Column("qdb_name", 1)]
                    }
                ]
            },
            new ReportDataSource
            {
                Id = Guid.NewGuid(),
                Composition = composition,
                EntityMappings =
                [
                    new ReportEntityMapping
                    {
                        Id = Guid.NewGuid(),
                        EntityLogicalName = "contact",
                        JoinExpressionJson = "{\"from\":\"contactid\",\"to\":\"qdb_contactid\"}",
                        Columns = [Column("fullname", 1)]
                    }
                ]
            }
        ]
    };

    [Fact]
    public void Build_JoinsASecondSourceIntoTheRootQuery_WhenItIsJoined()
    {
        // The historical behaviour, and the default for every source saved before MDS-FR-002.
        var query = ReportQueryBuilder.Build(ReportWithSecondSource(DatasetComposition.Joined),
            new ReportExecutionRequest());

        Assert.Contains("<link-entity name=\"contact\"", query.FetchXml);
    }

    [Fact]
    public void Build_LeavesAStandaloneSourceOutOfTheRootQuery()
    {
        // MDS-FR-004: a standalone dataset runs its own query. Flattening it here as well would put
        // its rows in the root table AND in its own block.
        var query = ReportQueryBuilder.Build(ReportWithSecondSource(DatasetComposition.Standalone),
            new ReportExecutionRequest());

        Assert.DoesNotContain("<link-entity name=\"contact\"", query.FetchXml);
    }

    [Fact]
    public void Build_KeepsTheRootColumnsWhenASourceIsStandalone()
    {
        var query = ReportQueryBuilder.Build(ReportWithSecondSource(DatasetComposition.Standalone),
            new ReportExecutionRequest());

        Assert.Contains("<attribute name=\"qdb_name\"", query.FetchXml);
        Assert.DoesNotContain("fullname", query.FetchXml);
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

    [Fact]
    public void Build_KeysAColumnByItsOutputAlias_SoAViewsLinkedFieldCanBeFound()
    {
        // A view names its own link alias, and the row arrives under "alias.attribute". The column
        // has to be keyed by that, or the value is looked up under a key the row does not carry.
        var linked = new ReportColumn
        {
            Id = Guid.NewGuid(),
            ColumnLogicalName = "emailaddress1",
            OutputAlias = "accountprimarycontact.emailaddress1",
            DisplayName = "Email (Contact)",
            SortOrder = 1,
            IsVisible = true
        };

        var column = ReportQueryBuilder.Build(Report(columns: [linked]), new ReportExecutionRequest()).Columns[0];

        Assert.Equal("accountprimarycontact.emailaddress1", column.Alias);
        Assert.Equal("emailaddress1", column.Attribute);
    }

    [Fact]
    public void Build_LabelsAColumnByItsDisplayName_NotByTheKeyItArrivesUnder()
    {
        var linked = new ReportColumn
        {
            Id = Guid.NewGuid(),
            ColumnLogicalName = "emailaddress1",
            OutputAlias = "accountprimarycontact.emailaddress1",
            DisplayName = "Email (Contact)",
            SortOrder = 1,
            IsVisible = true
        };

        var column = ReportQueryBuilder.Build(Report(columns: [linked]), new ReportExecutionRequest()).Columns[0];

        Assert.Equal("Email (Contact)", column.Label);
    }

    [Fact]
    public void Build_WithoutADisplayName_FallsBackToTheLogicalName()
    {
        var column = ReportQueryBuilder.Build(Report(columns: [Column("qdb_name", 1)]), new ReportExecutionRequest()).Columns[0];

        Assert.Equal("qdb_name", column.Label);
    }

    [Fact]
    public void Build_CapsTopAtWhatFetchXmlAccepts_RatherThanFailingTheReport()
    {
        // Dataverse rejects a top above 5000 with "Parameter name: top", which failed the whole
        // report. The designer default row limit is 50,000, so every report built from the
        // generated query hit it.
        var definition = Report(rowLimit: 50000, columns: [Column("qdb_name", 1)]);

        var query = ReportQueryBuilder.Build(definition, new ReportExecutionRequest());

        Assert.Contains("top=\"5000\"", query.FetchXml);
    }

    [Fact]
    public void Build_ReportsTheLimitItApplied_NotTheOneItWasAsked()
    {
        // Truncated is computed against this, so returning the uncapped number would call a full
        // page of rows "not truncated" when it was.
        var definition = Report(rowLimit: 50000, columns: [Column("qdb_name", 1)]);

        Assert.Equal(5000, ReportQueryBuilder.Build(definition, new ReportExecutionRequest()).RowLimit);
    }

    [Fact]
    public void Build_LeavesARowLimitFetchXmlAcceptsAlone()
    {
        var definition = Report(rowLimit: 250, columns: [Column("qdb_name", 1)]);

        Assert.Contains("top=\"250\"", ReportQueryBuilder.Build(definition, new ReportExecutionRequest()).FetchXml);
    }

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
