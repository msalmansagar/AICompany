using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Assembles the raw attribute rows of a report definition and its children into the runtime
/// <see cref="ReportDefinition"/> graph — columns nested under entity mappings, mappings under data
/// sources — matching foreign keys in memory. Pure — testable without a live CRM.
/// </summary>
public static class ReportDefinitionAssembler
{
    /// <summary>Assembles a <see cref="ReportDefinition"/> from its definition row and child rows.</summary>
    public static ReportDefinition Assemble(RawReportRows rows)
    {
        ArgumentNullException.ThrowIfNull(rows);
        var definition = rows.Definition;

        var columnsByMapping = rows.Columns
            .GroupBy(c => RowReader.Guid(c, "qdb_reportentitymappingid"))
            .Where(g => g.Key is not null)
            .ToDictionary(g => g.Key!.Value, g => g.Select(MapColumn).OrderBy(c => c.SortOrder).ToList());

        var mappingsByDataSource = rows.EntityMappings
            .GroupBy(m => RowReader.Guid(m, "qdb_reportdatasourceid"))
            .Where(g => g.Key is not null)
            .ToDictionary(g => g.Key!.Value, g => g.Select(m => MapMapping(m, columnsByMapping)).ToList());

        return new ReportDefinition
        {
            Id = RowReader.Guid(definition, "qdb_reportdefinitionid") ?? Guid.Empty,
            Name = RowReader.String(definition, "qdb_name") ?? string.Empty,
            ReportCode = RowReader.String(definition, "qdb_reportcode"),
            Description = RowReader.String(definition, "qdb_description"),
            MainEntityLogicalName = RowReader.String(definition, "qdb_mainentitylogicalname"),
            Category = RowReader.Coded(definition, "qdb_category"),
            Module = RowReader.Coded(definition, "qdb_module"),
            Status = RowReader.Coded(definition, "qdb_status"),
            ExecutionMode = RowReader.Coded(definition, "qdb_executionmode"),
            IsGoverned = RowReader.Bool(definition, "qdb_isgoverned"),
            RowLimit = RowReader.Int(definition, "qdb_rowlimit"),
            TimeoutMs = RowReader.Int(definition, "qdb_timeoutms"),
            DataSources = rows.DataSources.Select(d => MapDataSource(d, mappingsByDataSource))
                .OrderBy(d => d.ExecutionOrder).ToList(),
            Filters = rows.Filters.Select(MapFilter).OrderBy(f => f.Sequence).ToList(),
            Parameters = rows.Parameters.Select(MapParameter).OrderBy(p => p.DisplayOrder).ToList(),
            Formulas = rows.Formulas.Select(MapFormula).OrderBy(f => f.EvaluationOrder).ToList(),
            Transformations = rows.Transformations.Select(MapTransformation).OrderBy(t => t.StepOrder).ToList(),
            Relationships = rows.Relationships.Select(MapRelationship).OrderBy(r => r.Depth).ToList(),
            Layout = rows.Layouts.Count > 0 ? MapLayout(rows.Layouts[0]) : null
        };
    }

    private static ReportDataSource MapDataSource(
        IReadOnlyDictionary<string, object?> row,
        IReadOnlyDictionary<Guid, List<ReportEntityMapping>> mappingsByDataSource)
    {
        var id = RowReader.Guid(row, "qdb_reportdatasourceid") ?? Guid.Empty;
        return new ReportDataSource
        {
            Id = id,
            Name = RowReader.String(row, "qdb_name"),
            SourceType = RowReader.Coded(row, "qdb_sourcetype"),
            ExecutionOrder = RowReader.IntOrZero(row, "qdb_executionorder"),
            IsPrimary = RowReader.Bool(row, "qdb_isprimary"),
            SourceAlias = RowReader.String(row, "qdb_sourcealias"),
            EntityMappings = mappingsByDataSource.TryGetValue(id, out var mappings) ? mappings : []
        };
    }

    private static ReportEntityMapping MapMapping(
        IReadOnlyDictionary<string, object?> row,
        IReadOnlyDictionary<Guid, List<ReportColumn>> columnsByMapping)
    {
        var id = RowReader.Guid(row, "qdb_reportentitymappingid") ?? Guid.Empty;
        return new ReportEntityMapping
        {
            Id = id,
            EntityLogicalName = RowReader.String(row, "qdb_entitylogicalname"),
            EntityAlias = RowReader.String(row, "qdb_entityalias"),
            Depth = RowReader.IntOrZero(row, "qdb_depth"),
            JoinType = RowReader.Coded(row, "qdb_jointype"),
            Columns = columnsByMapping.TryGetValue(id, out var columns) ? columns : []
        };
    }

    private static ReportColumn MapColumn(IReadOnlyDictionary<string, object?> row) => new()
    {
        Id = RowReader.Guid(row, "qdb_reportcolumnid") ?? Guid.Empty,
        ColumnLogicalName = RowReader.String(row, "qdb_columnlogicalname"),
        OutputAlias = RowReader.String(row, "qdb_outputalias"),
        DataType = RowReader.Coded(row, "qdb_datatype"),
        AggregateFunction = RowReader.Coded(row, "qdb_aggregatefunction"),
        SortOrder = RowReader.IntOrZero(row, "qdb_sortorder"),
        GroupOrder = RowReader.IntOrZero(row, "qdb_grouporder"),
        IsVisible = RowReader.Bool(row, "qdb_isvisible")
    };

    private static ReportFilter MapFilter(IReadOnlyDictionary<string, object?> row) => new()
    {
        Id = RowReader.Guid(row, "qdb_reportfilterid") ?? Guid.Empty,
        FieldAlias = RowReader.String(row, "qdb_fieldalias"),
        Operator = RowReader.Coded(row, "qdb_operator"),
        Value = RowReader.String(row, "qdb_value"),
        ValueType = RowReader.Coded(row, "qdb_valuetype"),
        Sequence = RowReader.IntOrZero(row, "qdb_sequence"),
        GroupOperator = RowReader.Coded(row, "qdb_groupoperator"),
        GroupId = RowReader.String(row, "qdb_groupid"),
        IsRuntimePrompt = RowReader.Bool(row, "qdb_isruntimeprompt")
    };

    private static ReportParameter MapParameter(IReadOnlyDictionary<string, object?> row) => new()
    {
        Id = RowReader.Guid(row, "qdb_reportparameterid") ?? Guid.Empty,
        ParameterName = RowReader.String(row, "qdb_parametername"),
        Label = RowReader.String(row, "qdb_label"),
        ParamType = RowReader.Coded(row, "qdb_paramtype"),
        IsRequired = RowReader.Bool(row, "qdb_isrequired"),
        DefaultValue = RowReader.String(row, "qdb_defaultvalue"),
        DisplayOrder = RowReader.IntOrZero(row, "qdb_displayorder"),
        LookupTargetEntity = RowReader.String(row, "qdb_lookuptargetentity")
    };

    private static ReportFormula MapFormula(IReadOnlyDictionary<string, object?> row) => new()
    {
        Id = RowReader.Guid(row, "qdb_reportformulaid") ?? Guid.Empty,
        FormulaAlias = RowReader.String(row, "qdb_formulaalias"),
        Expression = RowReader.String(row, "qdb_expression"),
        ResultDataType = RowReader.Coded(row, "qdb_resultdatatype"),
        EvaluationOrder = RowReader.IntOrZero(row, "qdb_evaluationorder"),
        IsConditional = RowReader.Bool(row, "qdb_isconditional")
    };

    private static ReportTransformation MapTransformation(IReadOnlyDictionary<string, object?> row) => new()
    {
        Id = RowReader.Guid(row, "qdb_reporttransformationid") ?? Guid.Empty,
        TransformType = RowReader.Coded(row, "qdb_transformtype"),
        ConfigJson = RowReader.String(row, "qdb_configjson"),
        StepOrder = RowReader.IntOrZero(row, "qdb_steporder"),
        Enabled = RowReader.Bool(row, "qdb_enabled")
    };

    private static ReportRelationship MapRelationship(IReadOnlyDictionary<string, object?> row) => new()
    {
        Id = RowReader.Guid(row, "qdb_reportrelationshipid") ?? Guid.Empty,
        RelationshipType = RowReader.Coded(row, "qdb_relationshiptype"),
        OpenType = RowReader.Coded(row, "qdb_opentype"),
        ParentAlias = RowReader.String(row, "qdb_parentalias"),
        ParentKey = RowReader.String(row, "qdb_parentkey"),
        ChildAlias = RowReader.String(row, "qdb_childalias"),
        ChildKey = RowReader.String(row, "qdb_childkey"),
        Depth = RowReader.IntOrZero(row, "qdb_depth"),
        ExternalJoinJson = RowReader.String(row, "qdb_externaljoinjson"),
        SubReportId = RowReader.Guid(row, "qdb_subreportid")
    };

    private static ReportLayout MapLayout(IReadOnlyDictionary<string, object?> row) => new()
    {
        Id = RowReader.Guid(row, "qdb_reportlayoutid") ?? Guid.Empty,
        LayoutType = RowReader.Coded(row, "qdb_layouttype"),
        ThemeColor = RowReader.String(row, "qdb_themecolor"),
        LayoutJson = RowReader.String(row, "qdb_layoutjson"),
        HeaderJson = RowReader.String(row, "qdb_headerjson"),
        FooterJson = RowReader.String(row, "qdb_footerjson"),
        PageSettingsJson = RowReader.String(row, "qdb_pagesettingsjson")
    };
}

/// <summary>The raw attribute rows loaded for a report definition, grouped by child table.</summary>
public sealed record RawReportRows
{
    public required IReadOnlyDictionary<string, object?> Definition { get; init; }

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> DataSources { get; init; } = [];

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> EntityMappings { get; init; } = [];

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> Columns { get; init; } = [];

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> Filters { get; init; } = [];

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> Parameters { get; init; } = [];

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> Formulas { get; init; } = [];

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> Transformations { get; init; } = [];

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> Relationships { get; init; } = [];

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> Layouts { get; init; } = [];
}
