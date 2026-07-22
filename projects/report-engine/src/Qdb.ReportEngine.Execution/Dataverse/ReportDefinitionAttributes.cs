using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Maps a <see cref="ReportDefinition"/> and its children onto Dataverse attribute dictionaries for
/// create. Option-set values are written as their numeric <see cref="CodedValue.Code"/>; parent links
/// use the <c>@odata.bind</c> navigation-property names. Pure — the inverse of the loader's
/// row-to-model mapping, and testable without a live CRM.
/// </summary>
internal static class ReportDefinitionAttributes
{
    // Entity sets (collection names) used for the @odata.bind targets.
    public const string DefinitionSet = "qdb_reportdefinitions";
    public const string DataSourceSet = "qdb_reportdatasources";
    public const string EntityMappingSet = "qdb_reportentitymappings";

    public static Dictionary<string, object?> Definition(ReportDefinition definition) => new(StringComparer.Ordinal)
    {
        ["qdb_name"] = definition.Name,
        ["qdb_reportcode"] = definition.ReportCode,
        ["qdb_description"] = definition.Description,
        ["qdb_mainentitylogicalname"] = definition.MainEntityLogicalName,
        ["qdb_category"] = definition.Category?.Code,
        ["qdb_module"] = definition.Module?.Code,
        ["qdb_status"] = definition.Status?.Code,
        ["qdb_executionmode"] = definition.ExecutionMode?.Code,
        ["qdb_isgoverned"] = definition.IsGoverned,
        ["qdb_rowlimit"] = definition.RowLimit,
        ["qdb_timeoutms"] = definition.TimeoutMs
    };

    public static Dictionary<string, object?> DataSource(Guid definitionId, ReportDataSource source, int order) => new(StringComparer.Ordinal)
    {
        ["qdb_name"] = source.Name ?? "Data source",
        ["qdb_sourcetype"] = source.SourceType?.Code,
        ["qdb_executionorder"] = order,
        ["qdb_isprimary"] = source.IsPrimary,
        ["qdb_sourcealias"] = source.SourceAlias,
        ["Qdb_reportdefinitionid@odata.bind"] = Ref(DefinitionSet, definitionId)
    };

    public static Dictionary<string, object?> EntityMapping(Guid dataSourceId, ReportEntityMapping mapping) => new(StringComparer.Ordinal)
    {
        ["qdb_name"] = mapping.EntityLogicalName ?? "Entity",
        ["qdb_entitylogicalname"] = mapping.EntityLogicalName,
        ["qdb_entityalias"] = mapping.EntityAlias,
        ["qdb_depth"] = mapping.Depth,
        ["qdb_jointype"] = mapping.JoinType?.Code,
        ["Qdb_reportdatasourceid@odata.bind"] = Ref(DataSourceSet, dataSourceId)
    };

    public static Dictionary<string, object?> Column(Guid entityMappingId, ReportColumn column) => new(StringComparer.Ordinal)
    {
        ["qdb_name"] = column.OutputAlias ?? column.ColumnLogicalName ?? "Column",
        ["qdb_columnlogicalname"] = column.ColumnLogicalName,
        ["qdb_outputalias"] = column.OutputAlias,
        ["qdb_datatype"] = column.DataType?.Code,
        ["qdb_aggregatefunction"] = column.AggregateFunction?.Code,
        ["qdb_sortorder"] = column.SortOrder,
        ["qdb_grouporder"] = column.GroupOrder,
        ["qdb_isvisible"] = column.IsVisible,
        ["Qdb_reportentitymappingid@odata.bind"] = Ref(EntityMappingSet, entityMappingId)
    };

    public static Dictionary<string, object?> Filter(Guid definitionId, ReportFilter filter) => new(StringComparer.Ordinal)
    {
        ["qdb_name"] = filter.FieldAlias ?? "Filter",
        ["qdb_fieldalias"] = filter.FieldAlias,
        ["qdb_operator"] = filter.Operator?.Code,
        ["qdb_value"] = filter.Value,
        ["qdb_valuetype"] = filter.ValueType?.Code,
        ["qdb_sequence"] = filter.Sequence,
        ["qdb_groupoperator"] = filter.GroupOperator?.Code,
        ["qdb_groupid"] = filter.GroupId,
        ["qdb_isruntimeprompt"] = filter.IsRuntimePrompt,
        ["Qdb_reportdefinitionid@odata.bind"] = Ref(DefinitionSet, definitionId)
    };

    public static Dictionary<string, object?> Parameter(Guid definitionId, ReportParameter parameter) => new(StringComparer.Ordinal)
    {
        ["qdb_name"] = parameter.ParameterName ?? parameter.Label ?? "Parameter",
        ["qdb_parametername"] = parameter.ParameterName,
        ["qdb_label"] = parameter.Label,
        ["qdb_paramtype"] = parameter.ParamType?.Code,
        ["qdb_isrequired"] = parameter.IsRequired,
        ["qdb_defaultvalue"] = parameter.DefaultValue,
        ["qdb_displayorder"] = parameter.DisplayOrder,
        ["qdb_lookuptargetentity"] = parameter.LookupTargetEntity,
        ["Qdb_reportdefinitionid@odata.bind"] = Ref(DefinitionSet, definitionId)
    };

    public static Dictionary<string, object?> Layout(Guid definitionId, ReportLayout layout) => new(StringComparer.Ordinal)
    {
        ["qdb_name"] = "Layout",
        ["qdb_layouttype"] = layout.LayoutType?.Code,
        ["qdb_themecolor"] = layout.ThemeColor,
        ["qdb_layoutjson"] = layout.LayoutJson,
        ["qdb_headerjson"] = layout.HeaderJson,
        ["qdb_footerjson"] = layout.FooterJson,
        ["qdb_pagesettingsjson"] = layout.PageSettingsJson,
        ["Qdb_reportdefinitionid@odata.bind"] = Ref(DefinitionSet, definitionId)
    };

    public static Dictionary<string, object?> Formula(Guid definitionId, ReportFormula formula) => new(StringComparer.Ordinal)
    {
        ["qdb_name"] = formula.FormulaAlias ?? "Formula",
        ["qdb_formulaalias"] = formula.FormulaAlias,
        ["qdb_expression"] = formula.Expression,
        ["qdb_resultdatatype"] = formula.ResultDataType?.Code,
        ["qdb_evaluationorder"] = formula.EvaluationOrder,
        ["qdb_isconditional"] = formula.IsConditional,
        ["Qdb_reportdefinitionid@odata.bind"] = Ref(DefinitionSet, definitionId)
    };

    public static Dictionary<string, object?> Transformation(Guid definitionId, ReportTransformation transformation) => new(StringComparer.Ordinal)
    {
        ["qdb_name"] = "Transformation",
        ["qdb_transformtype"] = transformation.TransformType?.Code,
        ["qdb_configjson"] = transformation.ConfigJson,
        ["qdb_steporder"] = transformation.StepOrder,
        ["qdb_enabled"] = transformation.Enabled,
        ["Qdb_reportdefinitionid@odata.bind"] = Ref(DefinitionSet, definitionId)
    };

    public static Dictionary<string, object?> Relationship(Guid definitionId, ReportRelationship relationship)
    {
        var attributes = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["qdb_name"] = relationship.ChildAlias ?? "Relationship",
            ["qdb_relationshiptype"] = relationship.RelationshipType?.Code,
            ["qdb_opentype"] = relationship.OpenType?.Code,
            ["qdb_parentalias"] = relationship.ParentAlias,
            ["qdb_parentkey"] = relationship.ParentKey,
            ["qdb_childalias"] = relationship.ChildAlias,
            ["qdb_childkey"] = relationship.ChildKey,
            ["qdb_depth"] = relationship.Depth,
            ["qdb_externaljoinjson"] = relationship.ExternalJoinJson,
            ["Qdb_reportdefinitionid@odata.bind"] = Ref(DefinitionSet, definitionId)
        };
        if (relationship.SubReportId is { } subReportId)
        {
            attributes["qdb_SubReportId@odata.bind"] = Ref(DefinitionSet, subReportId);
        }

        return attributes;
    }

    private static string Ref(string entitySet, Guid id) => $"/{entitySet}({id})";
}
