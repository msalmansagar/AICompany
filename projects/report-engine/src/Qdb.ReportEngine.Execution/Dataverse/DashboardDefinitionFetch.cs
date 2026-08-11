using System.Xml.Linq;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// FetchXML for loading a persisted dashboard (qdb_dashboard → qdb_dashboardsection →
/// qdb_dashboardwidget) and the dashboard catalog. Pure — testable without a live CRM.
/// </summary>
public static class DashboardDefinitionFetch
{
    /// <summary>The dashboard record.</summary>
    public static string Dashboard(Guid dashboardId) =>
        Filtered("qdb_dashboard",
            ["qdb_dashboardid", "qdb_dashboardname", "qdb_dashboardcode", "qdb_description", "qdb_isgoverned"],
            "qdb_dashboardid", dashboardId, top: 1);

    /// <summary>Sections directly under the dashboard.</summary>
    public static string Sections(Guid dashboardId) =>
        Filtered("qdb_dashboardsection",
            ["qdb_dashboardsectionid", "qdb_dashboardsectionname", "qdb_columns", "qdb_sequence", "qdb_dashboardid"],
            "qdb_dashboardid", dashboardId);

    /// <summary>Widgets under the dashboard, reached via their section.</summary>
    public static string Widgets(Guid dashboardId)
    {
        var entity = Entity("qdb_dashboardwidget",
            "qdb_dashboardwidgetid", "qdb_dashboardwidgetname", "qdb_kind", "qdb_entity", "qdb_groupby",
            "qdb_measure", "qdb_aggregation", "qdb_charttype", "qdb_sequence", "qdb_dashboardsectionid");
        entity.Add(new XElement("link-entity",
            new XAttribute("name", "qdb_dashboardsection"),
            new XAttribute("from", "qdb_dashboardsectionid"),
            new XAttribute("to", "qdb_dashboardsectionid"),
            new XAttribute("alias", "sec"),
            new XElement("filter",
                new XElement("condition",
                    new XAttribute("attribute", "qdb_dashboardid"),
                    new XAttribute("operator", "eq"),
                    new XAttribute("value", dashboardId.ToString())))));
        return Wrap(entity, null);
    }

    /// <summary>All dashboards as catalog rows, ordered by name.</summary>
    public static string List()
    {
        var entity = Entity("qdb_dashboard", "qdb_dashboardid", "qdb_dashboardname", "qdb_dashboardcode", "qdb_description");
        entity.Add(new XElement("order", new XAttribute("attribute", "qdb_dashboardname")));
        return Wrap(entity, 200);
    }

    private static string Filtered(string entityName, string[] attributes, string filterAttribute, Guid value, int? top = null)
    {
        var entity = Entity(entityName, attributes);
        entity.Add(new XElement("filter",
            new XElement("condition",
                new XAttribute("attribute", filterAttribute),
                new XAttribute("operator", "eq"),
                new XAttribute("value", value.ToString()))));
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

    private static string Wrap(XElement entity, int? top)
    {
        var fetch = new XElement("fetch", entity);
        if (top.HasValue)
        {
            fetch.SetAttributeValue("top", top.Value);
        }

        return fetch.ToString(SaveOptions.DisableFormatting);
    }
}
