using System;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Reads scheduled-trigger populations one page at a time (FR-CSE-032, ADR-011). Each page is ordered by
    /// customer id and starts after the last id read, so the position survives customers leaving or joining the
    /// population between scheduler calls (analysis C3).
    /// </summary>
    public sealed class CustomerPopulationReader : ICustomerPopulationReader
    {
        private const int ActiveState = 0;
        private readonly IOrganizationService _service;
        private readonly CustomerLink _customer;

        public CustomerPopulationReader(IOrganizationService service, CustomerLink customer)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _customer = customer ?? throw new ArgumentNullException(nameof(customer));
        }

        /// <inheritdoc />
        public CustomerPage ReadActiveCustomers(Guid? afterCustomerId, int pageSize)
        {
            var idColumn = _customer.TableLogicalName + "id";
            var query = new QueryExpression(_customer.TableLogicalName) { ColumnSet = new ColumnSet(false), TopCount = pageSize };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, ActiveState);
            if (afterCustomerId.HasValue) query.Criteria.AddCondition(idColumn, ConditionOperator.GreaterThan, afterCustomerId.Value);
            query.AddOrder(idColumn, OrderType.Ascending);
            var ids = _service.RetrieveMultiple(query).Entities.Select(row => row.Id).ToList();
            return new CustomerPage { CustomerIds = ids, LastReadId = ids.Count > 0 ? ids.Last() : afterCustomerId, IsLast = ids.Count < pageSize };
        }

        /// <inheritdoc />
        public CustomerPage ReadCustomersActiveIn(PopulationQuery query, Guid? afterCustomerId, int pageSize)
        {
            var ids = _service.RetrieveMultiple(new FetchExpression(BuildFetchXml(query, afterCustomerId, pageSize))).Entities.Select(row => row.Id).ToList();
            return new CustomerPage { CustomerIds = ids, LastReadId = ids.Count > 0 ? ids.Last() : afterCustomerId, IsLast = ids.Count < pageSize };
        }

        /// <summary>
        /// One page of the org's customers with at least one of the source's records created in the period, after the last
        /// customer read; public so tests can check it. It reads the customer table, ordered by its own primary key, joined
        /// to the source: a lookup column is not sorted in the order a "gt" condition compares (checked live 2026-11-22),
        /// so paging on the source's lookup repeated and skipped customers. The inner join also keeps only the org's
        /// customer table when the lookup is polymorphic, as on the trigger path (SourceRecordReader).
        /// </summary>
        public string BuildFetchXml(PopulationQuery query, Guid? afterCustomerId, int pageSize)
        {
            var table = FetchXml.Escape(_customer.TableLogicalName);
            var idColumn = FetchXml.Escape(_customer.TableLogicalName + "id");
            var resume = afterCustomerId.HasValue ? FetchXml.Condition(_customer.TableLogicalName + "id", "gt", afterCustomerId.Value.ToString("D")) : string.Empty;
            return $"<fetch distinct='true' count='{pageSize}'><entity name='{table}'><attribute name='{idColumn}' /><order attribute='{idColumn}' />"
                + $"<filter type='and'>{resume}</filter>{SourceLink(query, idColumn)}</entity></fetch>";
        }

        private static string SourceLink(PopulationQuery query, string idColumn)
        {
            var fields = query.Source.Fields;
            var filter = new StringBuilder();
            filter.Append(FetchXml.Condition("createdon", "ge", query.Period.Start.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")));
            filter.Append(FetchXml.Condition("createdon", "lt", query.Period.EndExclusive.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")));
            if (!query.StatusValues.IsEmpty) filter.Append(FetchXml.In(fields.Status, query.StatusValues.ToArray()));
            if (!query.TypeValues.IsEmpty && !string.IsNullOrWhiteSpace(fields.Type)) filter.Append(FetchXml.In(fields.Type, query.TypeValues.ToArray()));
            return $"<link-entity name='{FetchXml.Escape(query.Source.TableLogicalName)}' from='{FetchXml.Escape(fields.CustomerLookup)}' to='{idColumn}' link-type='inner'>"
                + $"<filter type='and'>{filter}</filter></link-entity>";
        }
    }
}
