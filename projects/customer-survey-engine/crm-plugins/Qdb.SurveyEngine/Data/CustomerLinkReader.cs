using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Reads the org's customer table from qdb_survey_settings once per plugin execution.</summary>
    public static class CustomerLinkReader
    {
        /// <summary>The org's customer link; account when there is no settings row or the setting is empty.</summary>
        public static CustomerLink Read(IOrganizationService service)
        {
            if (service == null) throw new ArgumentNullException(nameof(service));
            var query = new QueryExpression("qdb_survey_settings") { ColumnSet = new ColumnSet("qdb_customer_table"), TopCount = 1 };
            var value = service.RetrieveMultiple(query).Entities.FirstOrDefault()?.GetAttributeValue<OptionSetValue>("qdb_customer_table")?.Value;
            return CustomerLink.For((CustomerTable?)value);
        }

        /// <summary>A reference to the customer in the org's customer table.</summary>
        public static EntityReference Reference(this CustomerLink link, Guid customerId) => new EntityReference(link.TableLogicalName, customerId);

        /// <summary>The customer id held in the row's lookup for this table, or null.</summary>
        public static Guid? CustomerIdOf(this CustomerLink link, Entity row) => row.GetAttributeValue<EntityReference>(link.LookupColumn)?.Id;
    }
}
