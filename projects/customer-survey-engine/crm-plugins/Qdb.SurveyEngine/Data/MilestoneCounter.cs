using System;
using System.Linq;
using System.Security;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Counts a customer's qualifying source records with a FetchXML aggregate, so the count is
    /// live (FR-CSE-039) and no rows are loaded into the plugin.
    /// </summary>
    public sealed class MilestoneCounter : IMilestoneCounter
    {
        private const string CountAlias = "qualifying";
        private readonly IOrganizationService _service;

        public MilestoneCounter(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public int CountQualifying(MilestoneCountQuery query)
        {
            if (query.Settings.StatusValues.IsEmpty) return 0;
            var result = _service.RetrieveMultiple(new FetchExpression(BuildFetchXml(query))).Entities.FirstOrDefault();
            var aliased = result?.GetAttributeValue<AliasedValue>(CountAlias);
            return aliased == null ? 0 : Convert.ToInt32(aliased.Value);
        }

        /// <summary>The aggregate FetchXML for <paramref name="query"/>; public so tests can check its filters.</summary>
        public static string BuildFetchXml(MilestoneCountQuery query)
        {
            var table = query.Source.TableLogicalName;
            var fields = query.Source.Fields;
            var filter = new StringBuilder();
            filter.Append(Condition(fields.CustomerLookup, "eq", query.CustomerId.ToString("D")));
            filter.Append(InCondition(fields.Status, query.Settings.StatusValues.ToArray()));
            if (!query.Settings.TypeValues.IsEmpty && !string.IsNullOrWhiteSpace(fields.Type)) filter.Append(InCondition(fields.Type, query.Settings.TypeValues.ToArray()));
            if (query.Settings.CountFrom.HasValue) filter.Append(Condition("createdon", "on-or-after", query.Settings.CountFrom.Value.ToString("yyyy-MM-dd")));
            if (query.CreatedBefore.HasValue) filter.Append(Condition("createdon", "lt", query.CreatedBefore.Value.ToUniversalTime().ToString("o")));
            return $"<fetch aggregate='true'><entity name='{Escape(table)}'><attribute name='{Escape(table)}id' alias='{CountAlias}' aggregate='count' />"
                + $"<filter type='and'>{filter}</filter></entity></fetch>";
        }

        private static string Condition(string attribute, string op, string value) =>
            $"<condition attribute='{Escape(attribute)}' operator='{op}' value='{Escape(value)}' />";

        private static string InCondition(string attribute, string[] values) =>
            $"<condition attribute='{Escape(attribute)}' operator='in'>{string.Concat(values.Select(v => $"<value>{Escape(v)}</value>"))}</condition>";

        private static string Escape(string text) => SecurityElement.Escape(text);
    }
}
