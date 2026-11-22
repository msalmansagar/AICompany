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
            var rows = _service.RetrieveMultiple(new FetchExpression(BuildFetchXml(query, afterCustomerId, pageSize))).Entities
                .Select(row => ReadCustomer(row, query.Source)).ToList();
            return new CustomerPage
            {
                CustomerIds = rows.Where(IsInCustomerTable).Select(customer => customer.Id).ToList(),
                LastReadId = rows.Count > 0 ? rows.Last().Id : afterCustomerId,
                IsLast = rows.Count < pageSize,
            };
        }

        // A polymorphic customer lookup can point at either table; only the org's customer table counts,
        // as on the trigger path (SourceRecordReader).
        private bool IsInCustomerTable(EntityReference customer) => customer.LogicalName == _customer.TableLogicalName;

        // The query filters out empty customers, so a missing value means the field name is wrong.
        private static EntityReference ReadCustomer(Entity row, SurveySource source)
        {
            var customer = row.GetAttributeValue<EntityReference>(source.Fields.CustomerLookup);
            if (customer == null)
                throw new InvalidPluginExecutionException($"Source {source.TableLogicalName}: customer field '{source.Fields.CustomerLookup}' returned no lookup value; check the field name on the survey source.");
            return customer;
        }

        /// <summary>
        /// One page of distinct customers of the source's records created in the period, after the last customer
        /// read; public so tests can check its filters.
        /// </summary>
        public static string BuildFetchXml(PopulationQuery query, Guid? afterCustomerId, int pageSize)
        {
            var fields = query.Source.Fields;
            var filter = new StringBuilder();
            filter.Append(FetchXml.NotNull(fields.CustomerLookup));
            filter.Append(FetchXml.Condition("createdon", "ge", query.Period.Start.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")));
            filter.Append(FetchXml.Condition("createdon", "lt", query.Period.EndExclusive.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")));
            if (afterCustomerId.HasValue) filter.Append(FetchXml.Condition(fields.CustomerLookup, "gt", afterCustomerId.Value.ToString("D")));
            if (!query.StatusValues.IsEmpty) filter.Append(FetchXml.In(fields.Status, query.StatusValues.ToArray()));
            if (!query.TypeValues.IsEmpty && !string.IsNullOrWhiteSpace(fields.Type)) filter.Append(FetchXml.In(fields.Type, query.TypeValues.ToArray()));
            var customer = FetchXml.Escape(fields.CustomerLookup);
            return $"<fetch distinct='true' count='{pageSize}'><entity name='{FetchXml.Escape(query.Source.TableLogicalName)}'>"
                + $"<attribute name='{customer}' /><order attribute='{customer}' /><filter type='and'>{filter}</filter></entity></fetch>";
        }
    }
}
