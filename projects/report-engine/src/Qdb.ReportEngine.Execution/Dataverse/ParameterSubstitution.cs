using System;
using System.Collections.Generic;
using System.Linq;
using System.Xml.Linq;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Resolves <c>@Parameter</c> tokens in an authored query — the SSRS pattern
/// (<c>value="@LoanId"</c>), for FetchXML. The supplied prompt value wins, then the parameter's
/// default, exactly the order ReportQueryBuilder resolves a runtime-prompt filter in.
///
/// A token substitutes only where it is the ENTIRE condition value — the <c>value</c> attribute or
/// a <c>&lt;value&gt;</c> list element — so a literal that merely contains an <c>@</c>, such as an
/// email address in a filter, is never touched.
///
/// An unknown or unfilled token THROWS rather than running the query as written: FetchXML would
/// happily match the six characters "@LoanId" against every row and return nothing, which is
/// indistinguishable from a query that legitimately found no rows — the silent-failure shape this
/// engine exists to remove. A block's catch turns the throw into a named failure block.
/// </summary>
public static class ParameterSubstitution
{
    /// <summary>Returns the query with every parameter token resolved, or unchanged when it has none.</summary>
    public static string ApplyTo(
        string fetchXml, ReportDefinition definition, IReadOnlyDictionary<string, string?> supplied)
    {
        if (string.IsNullOrWhiteSpace(fetchXml) || fetchXml.IndexOf('@') < 0)
        {
            return fetchXml;
        }

        XDocument document;
        try
        {
            document = XDocument.Parse(fetchXml);
        }
        catch (System.Xml.XmlException)
        {
            // An unparseable query is the platform's to refuse, with its own message.
            return fetchXml;
        }

        var changed = false;
        foreach (var condition in document.Descendants("condition"))
        {
            changed |= ResolveAttribute(condition.Attribute("value"), definition, supplied);
            foreach (var listValue in condition.Elements("value"))
            {
                changed |= ResolveElement(listValue, definition, supplied);
            }
        }

        return changed ? document.ToString(SaveOptions.DisableFormatting) : fetchXml;
    }

    private static bool ResolveAttribute(
        XAttribute? attribute, ReportDefinition definition, IReadOnlyDictionary<string, string?> supplied)
    {
        if (attribute is null || !TryResolve(attribute.Value, definition, supplied, out var resolved))
        {
            return false;
        }

        attribute.Value = resolved;
        return true;
    }

    private static bool ResolveElement(
        XElement element, ReportDefinition definition, IReadOnlyDictionary<string, string?> supplied)
    {
        if (!TryResolve(element.Value, definition, supplied, out var resolved))
        {
            return false;
        }

        element.Value = resolved;
        return true;
    }

    private static bool TryResolve(
        string raw, ReportDefinition definition, IReadOnlyDictionary<string, string?> supplied, out string resolved)
    {
        resolved = raw;
        var text = (raw ?? string.Empty).Trim();
        if (text.Length < 2 || text[0] != '@')
        {
            return false;
        }

        var name = text.Substring(1);
        var parameter = definition.Parameters.FirstOrDefault(p =>
            string.Equals(p.ParameterName, name, StringComparison.OrdinalIgnoreCase));
        if (parameter is null)
        {
            throw new InvalidOperationException(
                $"This query filters on \"@{name}\", but the report declares no parameter named \"{name}\" — "
                + "add the parameter, or correct the token.");
        }

        if (supplied.TryGetValue(name, out var value) && !string.IsNullOrEmpty(value))
        {
            resolved = value!;
            return true;
        }

        if (!string.IsNullOrEmpty(parameter.DefaultValue))
        {
            resolved = parameter.DefaultValue!;
            return true;
        }

        throw new InvalidOperationException(
            $"This query filters on \"@{name}\" and no value was supplied — provide the parameter when "
            + "running the report, or give it a default value.");
    }
}
