using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace EDP.RuleRuntime.Crm.Scenarios
{
    /// <summary>
    /// Reads a rule's saved scenario suite from its <c>qdb_edp_ruletest</c> record (one per rule,
    /// scenarios held as a JSON array in <c>qdb_edp_testcasesjson</c>). Scenarios are keyed to the
    /// RULE — not a version — so they persist across versions and form the regression baseline.
    /// </summary>
    public static class ScenarioStore
    {
        /// <summary>The scenario JSON array for a rule, or null when the rule has no scenario suite yet.</summary>
        public static string? LoadScenariosJson(IOrganizationService service, Guid ruleId)
        {
            var query = new QueryExpression("qdb_edp_ruletest")
            {
                ColumnSet = new ColumnSet("qdb_edp_testcasesjson"),
                TopCount = 1,
                Criteria = { Conditions = { new ConditionExpression("qdb_edp_ruleid", ConditionOperator.Equal, ruleId) } }
            };
            var record = service.RetrieveMultiple(query).Entities.FirstOrDefault();
            return record?.GetAttributeValue<string>("qdb_edp_testcasesjson");
        }
    }
}
