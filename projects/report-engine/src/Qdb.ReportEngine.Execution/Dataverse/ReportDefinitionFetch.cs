using System.Xml.Linq;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Builds the FetchXML for loading a report definition and its children, each scoped to the root
/// report id. Nested children (entity mappings, columns) reach the root through link-entity joins,
/// so every child set loads in a single root-filtered query. Pure — testable without a live CRM.
/// </summary>
public static class ReportDefinitionFetch
{
    /// <summary>The report definition record itself.</summary>
    public static string Definition(Guid reportId) =>
        Fetch("qdb_reportdefinition", top: 1,
            attributes:
            [
                "qdb_reportdefinitionid", "qdb_name", "qdb_reportcode", "qdb_description",
                "qdb_mainentitylogicalname", "qdb_category", "qdb_module", "qdb_status",
                "qdb_executionmode", "qdb_isgoverned", "qdb_rowlimit", "qdb_timeoutms"
            ],
            filterAttribute: "qdb_reportdefinitionid", filterValue: reportId);

    /// <summary>Data sources directly under the report.</summary>
    public static string DataSources(Guid reportId) =>
        Fetch("qdb_reportdatasource",
            attributes:
            [
                "qdb_reportdatasourceid", "qdb_name", "qdb_sourcetype", "qdb_executionorder",
                "qdb_isprimary", "qdb_sourcealias", "qdb_reportdefinitionid"
            ],
            filterAttribute: "qdb_reportdefinitionid", filterValue: reportId);

    /// <summary>Entity mappings, scoped via their data source's report.</summary>
    public static string EntityMappings(Guid reportId)
    {
        var entity = Entity("qdb_reportentitymapping",
            "qdb_reportentitymappingid", "qdb_entitylogicalname", "qdb_entityalias",
            "qdb_depth", "qdb_jointype", "qdb_reportdatasourceid");
        entity.Add(LinkToReport("qdb_reportdatasource", "qdb_reportdatasourceid", reportId));
        return Wrap(entity);
    }

    /// <summary>Columns, scoped via their entity mapping's data source's report.</summary>
    public static string Columns(Guid reportId)
    {
        var entity = Entity("qdb_reportcolumn",
            "qdb_reportcolumnid", "qdb_columnlogicalname", "qdb_outputalias", "qdb_datatype",
            "qdb_aggregatefunction", "qdb_sortorder", "qdb_grouporder", "qdb_isvisible",
            "qdb_reportentitymappingid");

        var mappingLink = new XElement("link-entity",
            new XAttribute("name", "qdb_reportentitymapping"),
            new XAttribute("from", "qdb_reportentitymappingid"),
            new XAttribute("to", "qdb_reportentitymappingid"),
            new XAttribute("alias", "map"));
        mappingLink.Add(LinkToReport("qdb_reportdatasource", "qdb_reportdatasourceid", reportId));
        entity.Add(mappingLink);
        return Wrap(entity);
    }

    /// <summary>Filters directly under the report.</summary>
    public static string Filters(Guid reportId) =>
        Fetch("qdb_reportfilter",
            attributes:
            [
                "qdb_reportfilterid", "qdb_fieldalias", "qdb_operator", "qdb_value",
                "qdb_valuetype", "qdb_sequence", "qdb_groupoperator", "qdb_groupid", "qdb_isruntimeprompt"
            ],
            filterAttribute: "qdb_reportdefinitionid", filterValue: reportId);

    /// <summary>Parameters directly under the report.</summary>
    public static string Parameters(Guid reportId) =>
        Fetch("qdb_reportparameter",
            attributes:
            [
                "qdb_reportparameterid", "qdb_parametername", "qdb_label", "qdb_paramtype",
                "qdb_isrequired", "qdb_defaultvalue", "qdb_displayorder", "qdb_lookuptargetentity"
            ],
            filterAttribute: "qdb_reportdefinitionid", filterValue: reportId);

    /// <summary>Transformations directly under the report.</summary>
    public static string Transformations(Guid reportId) =>
        Fetch("qdb_reporttransformation",
            attributes:
            [
                "qdb_reporttransformationid", "qdb_transformtype", "qdb_configjson",
                "qdb_steporder", "qdb_enabled"
            ],
            filterAttribute: "qdb_reportdefinitionid", filterValue: reportId);

    /// <summary>Relationships (drilldown/sub-report) directly under the report.</summary>
    public static string Relationships(Guid reportId) =>
        Fetch("qdb_reportrelationship",
            attributes:
            [
                "qdb_reportrelationshipid", "qdb_relationshiptype", "qdb_opentype", "qdb_parentalias",
                "qdb_parentkey", "qdb_childalias", "qdb_childkey", "qdb_depth", "qdb_externaljoinjson"
            ],
            filterAttribute: "qdb_reportdefinitionid", filterValue: reportId);

    /// <summary>Formulas (computed columns) directly under the report.</summary>
    public static string Formulas(Guid reportId) =>
        Fetch("qdb_reportformula",
            attributes:
            [
                "qdb_reportformulaid", "qdb_formulaalias", "qdb_expression", "qdb_resultdatatype",
                "qdb_evaluationorder", "qdb_isconditional"
            ],
            filterAttribute: "qdb_reportdefinitionid", filterValue: reportId);

    /// <summary>Layout(s) directly under the report.</summary>
    public static string Layouts(Guid reportId) =>
        Fetch("qdb_reportlayout",
            attributes:
            [
                "qdb_reportlayoutid", "qdb_layouttype", "qdb_themecolor", "qdb_layoutjson",
                "qdb_headerjson", "qdb_footerjson", "qdb_pagesettingsjson"
            ],
            filterAttribute: "qdb_reportdefinitionid", filterValue: reportId);

    private static string Fetch(string entityName, string[] attributes, string filterAttribute, Guid filterValue, int? top = null)
    {
        var entity = Entity(entityName, attributes);
        entity.Add(new XElement("filter",
            new XElement("condition",
                new XAttribute("attribute", filterAttribute),
                new XAttribute("operator", "eq"),
                new XAttribute("value", filterValue.ToString()))));
        return Wrap(entity, top);
    }

    private static XElement Entity(string entityName, params string[] attributes)
    {
        var entity = new XElement("entity", new XAttribute("name", entityName));
        foreach (var attribute in attributes)
        {
            entity.Add(new XElement("attribute", new XAttribute("name", attribute)));
        }

        return entity;
    }

    private static XElement LinkToReport(string linkEntity, string key, Guid reportId) =>
        new("link-entity",
            new XAttribute("name", linkEntity),
            new XAttribute("from", key),
            new XAttribute("to", key),
            new XAttribute("alias", "src"),
            new XElement("filter",
                new XElement("condition",
                    new XAttribute("attribute", "qdb_reportdefinitionid"),
                    new XAttribute("operator", "eq"),
                    new XAttribute("value", reportId.ToString()))));

    private static string Wrap(XElement entity, int? top = null)
    {
        var fetch = new XElement("fetch", entity);
        if (top.HasValue)
        {
            fetch.SetAttributeValue("top", top.Value);
        }

        return fetch.ToString(SaveOptions.DisableFormatting);
    }
}
