using System;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Dispatch;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>
    /// Dispatches secure-link invitations (B7, section 10). Registered async post-operation on
    /// qdb_survey_invitation Create and on Update filtered to qdb_status, so it covers invitations
    /// created by triggers, by the daily scheduled run, and Postponed ones released to Pending. Async,
    /// so a failed SMS or email never rolls back the invitation. Runs as SYSTEM.
    /// </summary>
    public sealed class InvitationDispatchPlugin : IPlugin
    {
        /// <summary>Plugin entry point.</summary>
        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null) throw new InvalidPluginExecutionException("serviceProvider must not be null.");
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.PrimaryEntityName != "qdb_survey_invitation" || context.PrimaryEntityId == Guid.Empty)
            {
                tracing.Trace("InvitationDispatchPlugin: {0} on {1} is not handled.", context.MessageName, context.PrimaryEntityName);
                return;
            }
            var system = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory))).CreateOrganizationService(null);
            var store = new DispatchStore(system);
            new InvitationDispatchService(new DispatchDependencies
            {
                Store = store,
                Config = store,
                Sms = new SmsHandOff(system),
                Email = new EmailSender(system),
                Suppressions = new SuppressionLogWriter(system),
                Clock = new SystemClock(),
                Trace = new TracingServiceTrace(tracing),
            }).Dispatch(context.PrimaryEntityId);
        }
    }
}
