using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// Delete-audit guard (F-07). Registered as a pre-operation step on the Delete message of
    /// qdb_edp_rule and qdb_edp_ruleversion, it writes an append-only qdb_edp_ruleaudit entry
    /// recording the deletion before it completes — so removals are not invisible to the audit
    /// log. The deleted record's id is stored in the details text (not a lookup), so the audit
    /// entry survives the deletion. A deleted rule's key is recorded as "ruleKey=<key>" so the key
    /// can be recognised as retired and never reused (FR-B3-14); at pre-operation the rule still exists.
    /// </summary>
    public sealed class DeleteAuditPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is EntityReference target))
                return;

            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            service.Create(new Entity("qdb_edp_ruleaudit")
            {
                ["qdb_edp_ruleauditname"] = $"Deleted {target.LogicalName} @ {DateTime.UtcNow:o}",
                ["qdb_edp_action"] = "Deleted",
                ["qdb_edp_actor"] = context.InitiatingUserId.ToString(),
                ["qdb_edp_actorid"] = new EntityReference("systemuser", context.InitiatingUserId), // F-06
                ["qdb_edp_auditedon"] = DateTime.UtcNow,
                ["qdb_edp_details"] = $"{target.LogicalName} {target.Id} deleted by {context.InitiatingUserId}{RuleKeySuffix(service, target)}",
            });
        }

        /// <summary>The marker the designer's reuse check searches for; empty for versions and unkeyed rules.</summary>
        public static string RuleKeyMarker(string ruleKey) => $"ruleKey={ruleKey}";

        private static string RuleKeySuffix(IOrganizationService service, EntityReference target)
        {
            if (target.LogicalName != "qdb_edp_rule") return string.Empty;
            var ruleKey = service.Retrieve(target.LogicalName, target.Id, new ColumnSet("qdb_edp_rulekey"))
                .GetAttributeValue<string>("qdb_edp_rulekey");
            return string.IsNullOrEmpty(ruleKey) ? string.Empty : "; " + RuleKeyMarker(ruleKey);
        }
    }
}
