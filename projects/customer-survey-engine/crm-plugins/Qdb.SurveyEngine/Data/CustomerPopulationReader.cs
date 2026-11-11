using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Reads scheduled-trigger populations, page by page (FR-CSE-032).</summary>
    public sealed class CustomerPopulationReader : ICustomerPopulationReader
    {
        private const int PageSize = 5000;
        private const int ActiveState = 0;
        private readonly IOrganizationService _service;
        private readonly CustomerLink _customer;

        public CustomerPopulationReader(IOrganizationService service, CustomerLink customer)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _customer = customer ?? throw new ArgumentNullException(nameof(customer));
        }

        /// <inheritdoc />
        public IReadOnlyList<Guid> GetActiveCustomers()
        {
            var query = new QueryExpression(_customer.TableLogicalName) { ColumnSet = new ColumnSet(false) };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, ActiveState);
            query.AddOrder(_customer.TableLogicalName + "id", OrderType.Ascending);
            return _service.RetrieveAll(query).Select(e => e.Id).ToList();
        }

        /// <inheritdoc />
        public IReadOnlyList<Guid> GetCustomersActiveIn(PopulationQuery query)
        {
            var ids = new HashSet<Guid>();
            for (var pageNumber = 1; ; pageNumber++)
            {
                var page = _service.RetrieveMultiple(new FetchExpression(BuildFetchXml(query, pageNumber)));
                foreach (var customer in page.Entities.Select(row => ReadCustomer(row, query.Source)).Where(IsInCustomerTable))
                    ids.Add(customer.Id);
                if (!page.MoreRecords) return ids.ToList();
            }
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

        /// <summary>Distinct customers of the source's records created in the period; public so tests can check its filters.</summary>
        public static string BuildFetchXml(PopulationQuery query, int pageNumber)
        {
            var fields = query.Source.Fields;
            var filter = new StringBuilder();
            filter.Append(FetchXml.NotNull(fields.CustomerLookup));
            filter.Append(FetchXml.Condition("createdon", "ge", query.Period.Start.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")));
            filter.Append(FetchXml.Condition("createdon", "lt", query.Period.EndExclusive.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")));
            if (!query.StatusValues.IsEmpty) filter.Append(FetchXml.In(fields.Status, query.StatusValues.ToArray()));
            if (!query.TypeValues.IsEmpty && !string.IsNullOrWhiteSpace(fields.Type)) filter.Append(FetchXml.In(fields.Type, query.TypeValues.ToArray()));
            var customer = FetchXml.Escape(fields.CustomerLookup);
            return $"<fetch distinct='true' count='{PageSize}' page='{pageNumber}'><entity name='{FetchXml.Escape(query.Source.TableLogicalName)}'>"
                + $"<attribute name='{customer}' /><order attribute='{customer}' /><filter type='and'>{filter}</filter></entity></fetch>";
        }
    }
}
