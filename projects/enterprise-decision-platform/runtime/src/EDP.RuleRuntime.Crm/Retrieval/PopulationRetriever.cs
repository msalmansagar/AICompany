using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Pcrm;
using EDP.RuleRuntime.Retrieval;

namespace EDP.RuleRuntime.Crm.Retrieval
{
    /// <summary>
    /// Runs a declared population retrieval and returns it as a collection the rule can quantify
    /// over (FR-F10, FR-F12, FR-F13, FR-F14).
    ///
    /// <para><b>Security (FR-F15):</b> this uses whatever <see cref="IOrganizationService"/> it is
    /// given. The plugin builds that with <c>CreateOrganizationService(context.UserId)</c>, so a
    /// retrieval runs as the CALLING USER and inherits their record and field-level security. It
    /// must never be handed a system-privileged service — that would turn an authored rule into a
    /// data-exfiltration surface with an approval workflow attached.</para>
    /// </summary>
    public sealed class PopulationRetriever
    {
        private const int PageSize = 500;

        private readonly IOrganizationService _service;

        public PopulationRetriever(IOrganizationService service)
            => _service = service ?? throw new ArgumentNullException(nameof(service));

        public IReadOnlyList<object?> Retrieve(PcrmRetrieval retrieval, RuleExecutionContext context)
        {
            if (retrieval == null) throw new ArgumentNullException(nameof(retrieval));
            Guard(retrieval);

            var rows = Page(BuildQuery(retrieval, context), retrieval);
            var records = new List<object?>(rows.Count);
            foreach (var row in rows) records.Add(ToRecord(row, retrieval.Select));

            return retrieval.GroupBy == null ? records : GroupSelector.SelectPerKey(records, retrieval.GroupBy);
        }

        /// <summary>
        /// The author-time gates again at runtime. A PCRM payload can reach the engine without
        /// passing through the validator — via a live canvas Test, or a hand-built call — so the
        /// guard rails cannot live only in the validator.
        /// </summary>
        private static void Guard(PcrmRetrieval retrieval)
        {
            if (retrieval.Filter == null || (retrieval.Filter.Conditions.Count == 0 && retrieval.Filter.Groups.Count == 0))
                throw new InvalidOperationException($"Retrieval '{retrieval.Name}' has no filter. An unfiltered population read is not permitted.");

            if (retrieval.MaxRows <= 0)
                throw new InvalidOperationException($"Retrieval '{retrieval.Name}' declares no row ceiling.");
        }

        private static QueryExpression BuildQuery(PcrmRetrieval retrieval, RuleExecutionContext context)
        {
            var query = new QueryExpression(retrieval.Entity)
            {
                ColumnSet = retrieval.Select.Count > 0 ? new ColumnSet(retrieval.Select.ToArray()) : new ColumnSet(false),
                Criteria = RetrievalFilterTranslator.Translate(retrieval.Filter!, context),
                PageInfo = new PagingInfo { Count = PageSize, PageNumber = 1 },
            };

            if (!string.IsNullOrWhiteSpace(retrieval.OrderBy))
                query.Orders.Add(new OrderExpression(retrieval.OrderBy, retrieval.Descending ? OrderType.Descending : OrderType.Ascending));

            return query;
        }

        /// <summary>
        /// Page until the population is exhausted, or FAIL on crossing the ceiling.
        ///
        /// FR-F13 is explicit that exceeding the ceiling fails rather than truncates, and FR-F12
        /// that truncation is never silent. A short population is indistinguishable from a small
        /// one, so a duplicate check that quietly stopped early reports "no duplicate found" —
        /// the same defect class as the `in` operator returning a silent false.
        /// </summary>
        private List<Entity> Page(QueryExpression query, PcrmRetrieval retrieval)
        {
            var rows = new List<Entity>();
            while (true)
            {
                var page = _service.RetrieveMultiple(query);
                rows.AddRange(page.Entities);

                if (rows.Count > retrieval.MaxRows)
                    throw new InvalidOperationException(
                        $"Retrieval '{retrieval.Name}' exceeded its ceiling of {retrieval.MaxRows} rows. " +
                        "The evaluation is failed rather than run against a partial population.");

                if (!page.MoreRecords) return rows;

                query.PageInfo.PageNumber++;
                query.PageInfo.PagingCookie = page.PagingCookie;
            }
        }

        /// <summary>
        /// A row becomes a field-addressable record, so a quantifier body reads it by bare name.
        /// The id travels as "id" because ADR-17 addresses a child verdict by it.
        /// </summary>
        private static IReadOnlyDictionary<string, object?> ToRecord(Entity row, IReadOnlyList<string> select)
        {
            var record = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) { ["id"] = row.Id.ToString() };
            foreach (var field in select)
                record[field] = CrmValueConverter.ToRuntime(row.Contains(field) ? row[field] : null);
            return record;
        }
    }
}
