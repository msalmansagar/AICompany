using System.Xml.Linq;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Builds the FetchXML aggregate query for a widget from its entity, group-by, measure, and
/// aggregation. Pure and side-effect free — the data provider executes the result over a
/// per-user connection. Testable without a live CRM.
/// </summary>
public static class FetchXmlAggregateBuilder
{
    /// <summary>Builds the aggregate FetchXML for <paramref name="widget"/>.</summary>
    public static string Build(DashboardWidget widget)
    {
        ArgumentNullException.ThrowIfNull(widget);

        var entity = new XElement("entity", new XAttribute("name", widget.Entity));
        entity.Add(BuildValueAttribute(widget));

        if (!string.IsNullOrEmpty(widget.GroupByAttribute))
        {
            entity.Add(new XElement("attribute",
                new XAttribute("name", widget.GroupByAttribute),
                new XAttribute("alias", "group"),
                new XAttribute("groupby", "true")));
        }

        var fetch = new XElement("fetch", new XAttribute("aggregate", "true"), entity);
        return fetch.ToString(SaveOptions.DisableFormatting);
    }

    // The measure column: aggregate the measure attribute, or count records when there is no measure.
    private static XElement BuildValueAttribute(DashboardWidget widget)
    {
        var hasMeasure = !string.IsNullOrEmpty(widget.MeasureAttribute) && widget.Aggregation != Aggregation.Count;
        return hasMeasure
            ? new XElement("attribute",
                new XAttribute("name", widget.MeasureAttribute!),
                new XAttribute("alias", "value"),
                new XAttribute("aggregate", MapAggregate(widget.Aggregation)))
            : new XElement("attribute",
                new XAttribute("name", $"{widget.Entity}id"),
                new XAttribute("alias", "value"),
                new XAttribute("aggregate", "count"));
    }

    private static string MapAggregate(Aggregation aggregation) => aggregation switch
    {
        Aggregation.Sum => "sum",
        Aggregation.Average => "avg",
        Aggregation.Max => "max",
        Aggregation.Min => "min",
        Aggregation.Count => "count",
        _ => throw new ArgumentOutOfRangeException(nameof(aggregation), aggregation, "Unsupported aggregation.")
    };
}
