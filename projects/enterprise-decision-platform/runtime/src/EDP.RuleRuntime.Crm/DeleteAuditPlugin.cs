using System;
using Microsoft.Xrm.Sdk;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// Delete-audit guard (F-07). Registered as a pre-operation step on the Delete message of
    /// qdb_edp_rule and qdb_edp_ruleversion, it writes an append-only qdb_edp_ruleaudit entry
    /// recording the deletion before it completes — so removals are not invisible to the audit
    /// log. The deleted record's id is stored in the details text (not a lookup), so the audit
    /// entry survives the deletion.
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
                ["qdb_edp_auditedon"] = DateTime.UtcNow,
                ["qdb_edp_details"] = $"{target.LogicalName} {target.Id} deleted by {context.InitiatingUserId}",
            });
        }
    }
}
