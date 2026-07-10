using System;
using Microsoft.Xrm.Sdk;
using EDP.RuleRuntime.Crm.Governance;
using EDP.RuleRuntime.Crm.Sinks;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// Custom API entry point for maker-checker governance. A thin adapter: marshals
    /// inputs, calls <see cref="GovernanceService"/>, marshals the result out.
    ///
    /// Input parameters:
    ///   RuleVersionId (string, GUID) — the version to transition.
    ///   Action        (string) — Submit | Approve | Reject | Publish | Retire.
    ///   Comments      (string, optional) — reviewer/approver note.
    /// Output parameters:
    ///   Success (bool), NewState (string), Message (string).
    /// </summary>
    public sealed class GovernanceActionPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            try
            {
                var ruleVersionId = Guid.Parse((string)context.InputParameters["RuleVersionId"]);
                var action = (string)context.InputParameters["Action"];
                var comments = context.InputParameters.Contains("Comments") ? context.InputParameters["Comments"] as string : null;

                var governance = new GovernanceService(service, new DataverseAuditSink(service));
                var result = governance.PerformAction(ruleVersionId, action, comments, context.InitiatingUserId);

                context.OutputParameters["Success"] = result.Success;
                context.OutputParameters["NewState"] = result.NewState;
                context.OutputParameters["Message"] = result.Message;
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException($"EDP governance action failed: {ex.Message}", ex);
            }
        }
    }
}
