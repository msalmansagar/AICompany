using System.Linq;
using System.Xml.Linq;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Applies a report's own filters to a query it did not build.
///
/// A saved view — or an author-written FetchXML — replaces the generated query outright, which used
/// to discard the report's filters with it. The Filters tab stayed editable and the runtime still
/// prompted for parameters, so someone could narrow a report, watch it save, and get every row back.
/// Parameters were worse than inert: filters are their only consumer, so a prompt answered carefully
/// changed nothing at all.
///
/// FetchXML treats sibling <c>filter</c> elements under an entity as ANDed, so the report's filters
/// are appended rather than merged into the view's own. The view keeps narrowing what it narrowed,
/// and the report narrows further — which is what an author means by filtering a view-backed report.
/// </summary>
public static class FetchXmlFilters
{
    /// <summary>
    /// Returns <paramref name="suppliedFetchXml"/> with the root-level filters from
    /// <paramref name="generatedFetchXml"/> appended, or unchanged when there are none to apply.
    /// </summary>
    public static string ApplyTo(string suppliedFetchXml, string generatedFetchXml)
    {
        var supplied = Parse(suppliedFetchXml);
        var generated = Parse(generatedFetchXml);
        if (supplied is null || generated is null)
        {
            return suppliedFetchXml;
        }

        var suppliedEntity = supplied.Root?.Element("entity");
        var generatedEntity = generated.Root?.Element("entity");
        if (suppliedEntity is null || generatedEntity is null)
        {
            return suppliedFetchXml;
        }

        // Only the entity's own filters. Ones nested in a link-entity belong to a join this query
        // does not have, and hoisting them would filter the wrong table.
        var filters = generatedEntity.Elements("filter").ToList();
        if (filters.Count == 0)
        {
            return suppliedFetchXml;
        }

        foreach (var filter in filters)
        {
            suppliedEntity.Add(new XElement(filter));
        }

        return supplied.ToString(SaveOptions.DisableFormatting);
    }

    /// <summary>Unparseable XML is left to the caller to fail on, with its own message.</summary>
    private static XDocument? Parse(string xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
        {
            return null;
        }

        try
        {
            return XDocument.Parse(xml);
        }
        catch (System.Xml.XmlException)
        {
            return null;
        }
    }
}
