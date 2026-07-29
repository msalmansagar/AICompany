using System.Linq;
using System.Xml.Linq;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Applies a report's grouping and measures to a query it did not build.
///
/// A saved view replaces the generated query, and the generated query is where the aggregate lived —
/// so a report with a Count or a Sum returned every underlying row instead, ungrouped and unlabelled
/// as such. Not an error, not empty: plausible-looking rows where a total was asked for, which is
/// the worst answer a report can give.
///
/// The rows a view selects are defined by its filters and its joins, not by the attributes it
/// projects. Those are kept and the projection is replaced: attributes and orders come out at every
/// level, the report's grouped attributes and measures go in, and the fetch becomes an aggregate one.
///
/// What cannot be expressed is refused rather than approximated — see <see cref="CanApplyTo"/>.
/// </summary>
public static class FetchXmlAggregates
{
    /// <summary>
    /// Whether the report's aggregate can be expressed against the supplied query at all.
    ///
    /// A measure or grouping over a column the VIEW joined in is the case that cannot: it arrives
    /// under the view's own alias ("acct.name"), which is not an attribute name FetchXML can group
    /// by. Aggregating it would need the attribute placed inside that link-entity with its own
    /// groupby, and no alias in the definition says which link it came from.
    /// </summary>
    public static bool CanApplyTo(string generatedFetchXml)
    {
        var generated = Parse(generatedFetchXml);
        var entity = generated?.Root?.Element("entity");
        if (entity is null)
        {
            return false;
        }

        return !entity.Elements("attribute")
            .Any(a => (a.Attribute("alias")?.Value ?? string.Empty).Contains('.'));
    }

    /// <summary>
    /// Returns the supplied query rewritten to aggregate the way the report asks, or null when that
    /// cannot be expressed — the caller is expected to say so rather than run the wrong query.
    /// </summary>
    public static string? ApplyTo(string suppliedFetchXml, string generatedFetchXml)
    {
        var supplied = Parse(suppliedFetchXml);
        var generated = Parse(generatedFetchXml);
        var suppliedEntity = supplied?.Root?.Element("entity");
        var generatedEntity = generated?.Root?.Element("entity");
        if (supplied is null || suppliedEntity is null || generatedEntity is null || !CanApplyTo(generatedFetchXml))
        {
            return null;
        }

        StripProjection(suppliedEntity);
        foreach (var attribute in generatedEntity.Elements("attribute"))
        {
            suppliedEntity.Add(new XElement(attribute));
        }

        // Orders on a grouped query must name an alias, so the view's own ordering cannot survive;
        // the report's group order replaces it.
        foreach (var order in generatedEntity.Elements("order"))
        {
            suppliedEntity.Add(new XElement(order));
        }

        var fetch = supplied.Root!;
        fetch.SetAttributeValue("aggregate", "true");
        fetch.SetAttributeValue("top", null);      // an aggregate fetch rejects top
        fetch.SetAttributeValue("count", null);
        return supplied.ToString(SaveOptions.DisableFormatting);
    }

    /// <summary>
    /// Removes what a query returns while leaving what it matches: filters and links stay, so the
    /// view goes on selecting the same rows.
    /// </summary>
    private static void StripProjection(XElement element)
    {
        element.Elements("attribute").Remove();
        element.Elements("all-attributes").Remove();
        element.Elements("order").Remove();

        foreach (var link in element.Elements("link-entity"))
        {
            StripProjection(link);
        }
    }

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
