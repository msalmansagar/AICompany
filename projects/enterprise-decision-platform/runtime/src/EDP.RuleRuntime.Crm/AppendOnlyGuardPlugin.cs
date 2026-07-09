using System;
using Microsoft.Xrm.Sdk;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// Governance integrity guard (ADR-13 tier-1 audit is append-only; Phase-6 audit
    /// principle; Phase-6 C-005 pen-test target). Registered as a synchronous
    /// pre-validation step on the Update and Delete messages of the append-only tables
    /// (qdb_edp_ruleaudit, qdb_edp_ruleexecutionlog, qdb_edp_ruleapproval). Any attempt to
    /// mutate or delete an existing record throws, making the trail tamper-evident at the
    /// platform layer.
    ///
    /// This does not stop a System Administrator who disables the step — that residual is
    /// documented in ADR-12 and accepted; the guard raises the bar and is column-audited.
    /// </summary>
    public sealed class AppendOnlyGuardPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var entity = ResolveEntityName(context);
            throw new InvalidPluginExecutionException(
                $"'{entity}' is an append-only governance record ({context.MessageName} is not permitted). " +
                "Records may be created but never modified or deleted.");
        }

        private static string ResolveEntityName(IPluginExecutionContext context)
        {
            if (context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity e)
                return e.LogicalName;
            if (context.InputParameters.Contains("Target") && context.InputParameters["Target"] is EntityReference r)
                return r.LogicalName;
            return context.PrimaryEntityName ?? "record";
        }
    }
}
