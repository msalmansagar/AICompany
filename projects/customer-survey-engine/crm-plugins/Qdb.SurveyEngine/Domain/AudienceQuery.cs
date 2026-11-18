using System;
using System.Globalization;
using System.Linq;
using System.Xml;
using System.Xml.Linq;

namespace Qdb.SurveyEngine.Domain
{
    /// <summary>
    /// The audience of a One-time trigger as a query over the org's customer table (FR-CSE-089..091,
    /// ADR-009). The stored FetchXML is never run as written: only its filter and link-entity elements
    /// are kept, the engine reads the customer id only, and it pages with a cookie. Columns, sort order,
    /// top and paging in the stored filter are ignored; an aggregate or another table is refused.
    /// </summary>
    public sealed class AudienceQuery
    {
        private const int ActiveState = 0;
        private readonly string _customerTable;
        private readonly XElement[] _criteria;

        private AudienceQuery(string customerTable, XElement[] criteria)
        {
            _customerTable = customerTable;
            _criteria = criteria;
        }

        /// <summary>Every active customer (statecode 0) of the customer table.</summary>
        public static AudienceQuery AllActive(string customerTable)
        {
            RequireTable(customerTable);
            var activeOnly = new XElement("filter", new XAttribute("type", "and"),
                new XElement("condition", new XAttribute("attribute", "statecode"), new XAttribute("operator", "eq"), new XAttribute("value", ActiveState)));
            return new AudienceQuery(customerTable, new[] { activeOnly });
        }

        /// <summary>The audience described by a stored filter; throws <see cref="AudienceFilterException"/> when it cannot be used.</summary>
        public static AudienceQuery FromFetchXml(string fetchXml, string customerTable)
        {
            RequireTable(customerTable);
            var entity = ReadSingleEntity(ParseFetch(fetchXml));
            var table = (string)entity.Attribute("name");
            if (!string.Equals(table, customerTable, StringComparison.OrdinalIgnoreCase))
                throw new AudienceFilterException($"The audience filter is on '{table}', but this org's customers are '{customerTable}' records.");
            var criteria = entity.Elements().Where(IsCriteria).Select(WithoutColumns).ToArray();
            RefuseUserRelativeConditions(criteria);
            return new AudienceQuery(customerTable, criteria);
        }

        // QA-D1 (CEO 2026-11-18): Preview and Send run as SYSTEM, so "current user" conditions would select
        // SYSTEM's records — nobody. The panel replaces them with the administrator when a view is copied;
        // anything left is refused here rather than sending to no one.
        private static readonly string[] UserRelativeOperators =
        {
            "eq-userid", "ne-userid", "eq-userteams", "eq-useroruserteams", "eq-useroruserhierarchy",
            "eq-useroruserhierarchyandteams", "eq-businessid", "ne-businessid", "eq-userlanguage",
        };

        private static void RefuseUserRelativeConditions(XElement[] criteria)
        {
            var found = criteria.SelectMany(element => element.DescendantsAndSelf("condition"))
                .Select(condition => ((string)condition.Attribute("operator") ?? string.Empty).ToLowerInvariant())
                .Where(op => UserRelativeOperators.Contains(op)).Distinct().ToArray();
            if (found.Length > 0)
                throw new AudienceFilterException($"The audience uses a 'current user' condition ({string.Join(", ", found)}), which a survey sent by the server cannot resolve. Copy the view again (the panel fills in your user), or replace the condition with a specific user, team or business unit.");
        }

        /// <summary>One page of the audience: customer ids only, distinct, in id order.</summary>
        public string ToPageFetchXml(int pageNumber, int pageSize, string pagingCookie)
        {
            if (pageNumber < 1) throw new ArgumentOutOfRangeException(nameof(pageNumber));
            if (pageSize < 1) throw new ArgumentOutOfRangeException(nameof(pageSize));
            var idColumn = _customerTable + "id";
            var fetch = new XElement("fetch",
                new XAttribute("distinct", "true"), new XAttribute("no-lock", "true"), new XAttribute("mapping", "logical"),
                new XAttribute("count", pageSize.ToString(CultureInfo.InvariantCulture)), new XAttribute("page", pageNumber.ToString(CultureInfo.InvariantCulture)),
                new XElement("entity", new XAttribute("name", _customerTable),
                    new XElement("attribute", new XAttribute("name", idColumn)),
                    new XElement("order", new XAttribute("attribute", idColumn)),
                    _criteria.Select(element => new XElement(element))));
            if (!string.IsNullOrEmpty(pagingCookie)) fetch.Add(new XAttribute("paging-cookie", pagingCookie));
            return fetch.ToString(SaveOptions.DisableFormatting);
        }

        private static void RequireTable(string customerTable)
        {
            if (string.IsNullOrWhiteSpace(customerTable)) throw new ArgumentException("The customer table is required.", nameof(customerTable));
        }

        private static XElement ParseFetch(string fetchXml)
        {
            if (string.IsNullOrWhiteSpace(fetchXml)) throw new AudienceFilterException("The audience filter is empty. Build it with the filter builder on the trigger form.");
            XElement root;
            try
            {
                root = XElement.Parse(fetchXml);
            }
            catch (XmlException invalid)
            {
                throw new AudienceFilterException("The audience filter is not valid FetchXML: " + invalid.Message);
            }
            if (root.Name.LocalName != "fetch") throw new AudienceFilterException("The audience filter must start with <fetch>.");
            if (string.Equals((string)root.Attribute("aggregate"), "true", StringComparison.OrdinalIgnoreCase))
                throw new AudienceFilterException("The audience filter is an aggregate query; it must list customers.");
            return root;
        }

        private static XElement ReadSingleEntity(XElement fetch)
        {
            var entities = fetch.Elements("entity").ToArray();
            if (entities.Length != 1) throw new AudienceFilterException("The audience filter must have exactly one <entity>.");
            return entities[0];
        }

        private static bool IsCriteria(XElement element) => element.Name.LocalName == "filter" || element.Name.LocalName == "link-entity";

        // Columns and sort orders inside link-entities add nothing to "which customers" and can break distinct paging.
        private static XElement WithoutColumns(XElement element)
        {
            var copy = new XElement(element);
            copy.Descendants().Where(IsColumnOrOrder).ToList().ForEach(node => node.Remove());
            return copy;
        }

        private static bool IsColumnOrOrder(XElement element) =>
            element.Name.LocalName == "attribute" || element.Name.LocalName == "all-attributes" || element.Name.LocalName == "order";
    }

    /// <summary>A stored audience filter cannot be used; the message is shown to the administrator.</summary>
    public sealed class AudienceFilterException : Exception
    {
        public AudienceFilterException(string message) : base(message) { }
    }
}
