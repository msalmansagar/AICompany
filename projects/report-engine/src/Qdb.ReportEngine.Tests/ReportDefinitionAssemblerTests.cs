using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class ReportDefinitionAssemblerTests
{
    private static readonly Guid DefId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid DsId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid MapId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    [Fact]
    public void Assemble_NestsColumnsUnderMappingsUnderDataSources()
    {
        var rows = FullReport();

        var report = ReportDefinitionAssembler.Assemble(rows);

        var dataSource = Assert.Single(report.DataSources);
        Assert.Equal(DsId, dataSource.Id);
        var mapping = Assert.Single(dataSource.EntityMappings);
        Assert.Equal("qdb_loan_application", mapping.EntityLogicalName);
        Assert.Equal(2, mapping.Columns.Count);
    }

    [Fact]
    public void Assemble_ReadsScalarsAndCodedValues()
    {
        var report = ReportDefinitionAssembler.Assemble(FullReport());

        Assert.Equal("Overdue Facilities", report.Name);
        Assert.Equal("RPT-001", report.ReportCode);
        Assert.True(report.IsGoverned);
        Assert.Equal(5000, report.RowLimit);
        Assert.Equal(2, report.Status?.Code);
        Assert.Equal("Published", report.Status?.Label);
    }

    [Fact]
    public void Assemble_OrdersColumnsBySortOrderAndFiltersBySequence()
    {
        var report = ReportDefinitionAssembler.Assemble(FullReport());

        var columns = report.DataSources[0].EntityMappings[0].Columns;
        Assert.Equal("qdb_name", columns[0].ColumnLogicalName);   // sortorder 1
        Assert.Equal("qdb_amount", columns[1].ColumnLogicalName); // sortorder 2
        Assert.Equal(2, report.Filters.Count);
        Assert.Equal("f-first", report.Filters[0].FieldAlias);    // sequence 1
    }

    [Fact]
    public void Assemble_ResolvesLookupForeignKeysInWebApiValueForm()
    {
        // FetchXML/Web API returns lookups as "_<name>_value"; nesting must still resolve.
        var rows = new RawReportRows
        {
            Definition = DefinitionRow(),
            DataSources = [Row(("qdb_reportdatasourceid", DsId.ToString()), ("qdb_name", "Primary"))],
            EntityMappings = [Row(
                ("qdb_reportentitymappingid", MapId.ToString()),
                ("_qdb_reportdatasourceid_value", DsId.ToString()))],
            Columns = [Row(
                ("qdb_reportcolumnid", Guid.NewGuid().ToString()), ("qdb_columnlogicalname", "qdb_amount"),
                ("_qdb_reportentitymappingid_value", MapId.ToString()))]
        };

        var report = ReportDefinitionAssembler.Assemble(rows);

        Assert.Single(report.DataSources[0].EntityMappings);
        Assert.Single(report.DataSources[0].EntityMappings[0].Columns);
    }

    [Fact]
    public void Assemble_NoChildren_YieldsEmptyCollectionsAndNoLayout()
    {
        var rows = new RawReportRows { Definition = DefinitionRow() };

        var report = ReportDefinitionAssembler.Assemble(rows);

        Assert.Empty(report.DataSources);
        Assert.Empty(report.Filters);
        Assert.Empty(report.Parameters);
        Assert.Null(report.Layout);
    }

    private static RawReportRows FullReport() => new()
    {
        Definition = DefinitionRow(),
        DataSources = [Row(
            ("qdb_reportdatasourceid", DsId.ToString()), ("qdb_name", "Primary"),
            ("qdb_executionorder", 1L), ("qdb_isprimary", true))],
        EntityMappings = [Row(
            ("qdb_reportentitymappingid", MapId.ToString()), ("qdb_entitylogicalname", "qdb_loan_application"),
            ("qdb_reportdatasourceid", DsId.ToString()))],
        Columns =
        [
            Row(("qdb_reportcolumnid", Guid.NewGuid().ToString()), ("qdb_columnlogicalname", "qdb_amount"),
                ("qdb_sortorder", 2L), ("qdb_reportentitymappingid", MapId.ToString())),
            Row(("qdb_reportcolumnid", Guid.NewGuid().ToString()), ("qdb_columnlogicalname", "qdb_name"),
                ("qdb_sortorder", 1L), ("qdb_reportentitymappingid", MapId.ToString()))
        ],
        Filters =
        [
            Row(("qdb_reportfilterid", Guid.NewGuid().ToString()), ("qdb_fieldalias", "f-second"), ("qdb_sequence", 2L)),
            Row(("qdb_reportfilterid", Guid.NewGuid().ToString()), ("qdb_fieldalias", "f-first"), ("qdb_sequence", 1L))
        ],
        Parameters = [Row(("qdb_reportparameterid", Guid.NewGuid().ToString()), ("qdb_parametername", "branch"), ("qdb_displayorder", 1L))],
        Layouts = [Row(("qdb_reportlayoutid", Guid.NewGuid().ToString()), ("qdb_themecolor", "#0078d4"))]
    };

    private static Dictionary<string, object?> DefinitionRow() => Row(
        ("qdb_reportdefinitionid", DefId.ToString()),
        ("qdb_name", "Overdue Facilities"),
        ("qdb_reportcode", "RPT-001"),
        ("qdb_isgoverned", true),
        ("qdb_rowlimit", 5000L),
        ("qdb_status", 2L),
        ("qdb_status@OData.Community.Display.V1.FormattedValue", "Published"));

    private static Dictionary<string, object?> Row(params (string Key, object? Value)[] pairs)
    {
        var row = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (key, value) in pairs)
        {
            row[key] = value;
        }

        return row;
    }
}
