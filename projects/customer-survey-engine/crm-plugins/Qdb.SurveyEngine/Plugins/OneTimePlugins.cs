using System;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.OneTime;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>Custom API qdb_srv_PreviewAudience (FR-CSE-084): input TriggerId (Guid); outputs Count (int) and Message (string).</summary>
    public sealed class PreviewAudiencePlugin : OneTimePluginBase
    {
        public const string CountProperty = "Count";

        protected override string Run(OneTimeSendService sender, Guid triggerId, IPluginExecutionContext context)
        {
            var count = sender.Preview(triggerId);
            context.OutputParameters[CountProperty] = count;
            return $"{count} customer(s) match the audience now.";
        }
    }

    /// <summary>
    /// Custom API qdb_srv_SendOneTimeTrigger (FR-CSE-084, 086, NFR-CSE-015): input TriggerId (Guid); outputs
    /// Status (string), Invited, Postponed, Suppressed (int), IsComplete (bool) and Message (string). The form
    /// calls again while IsComplete is false.
    /// </summary>
    public sealed class SendOneTimeTriggerPlugin : OneTimePluginBase
    {
        public const string StatusProperty = "Status";
        public const string InvitedProperty = "Invited";
        public const string PostponedProperty = "Postponed";
        public const string SuppressedProperty = "Suppressed";
        public const string IsCompleteProperty = "IsComplete";

        // Shorter than the scheduler's 90 s so the form can show progress between calls.
        private static readonly TimeSpan WorkAllowance = TimeSpan.FromSeconds(60);

        protected override string Run(OneTimeSendService sender, Guid triggerId, IPluginExecutionContext context)
        {
            var result = sender.Send(triggerId, new RunBudget(new SystemClock(), WorkAllowance));
            context.OutputParameters[StatusProperty] = result.Status.ToString();
            context.OutputParameters[InvitedProperty] = result.Counts.Invited;
            context.OutputParameters[PostponedProperty] = result.Counts.Postponed;
            context.OutputParameters[SuppressedProperty] = result.Counts.Suppressed;
            context.OutputParameters[IsCompleteProperty] = result.IsComplete;
            return result.Message.Length > 0 ? result.Message : result.ToString();
        }
    }

    /// <summary>
    /// Shared plumbing: the caller must be a Survey Admin or System Administrator (NFR-CSE-017); the work
    /// runs as SYSTEM. A refusal reaches the caller as an error with the reason.
    /// </summary>
    public abstract class OneTimePluginBase : IPlugin
    {
        public const string TriggerIdParameter = "TriggerId";
        public const string MessageProperty = "Message";

        /// <summary>Plugin entry point.</summary>
        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null) throw new InvalidPluginExecutionException("serviceProvider must not be null.");
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var triggerId = ReadTriggerId(context);
            var system = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory))).CreateOrganizationService(null);
            RequireSurveyAdmin(system, context.InitiatingUserId);
            try
            {
                var message = Run(BuildSender(system, tracing), triggerId, context);
                tracing.Trace("Trigger {0:D}: {1}", triggerId, message);
                context.OutputParameters[MessageProperty] = message;
            }
            catch (OneTimeSendRefusedException refused)
            {
                tracing.Trace("Refused for user {0:D}, trigger {1:D}: {2}", context.InitiatingUserId, triggerId, refused.Message);
                throw new InvalidPluginExecutionException(refused.Message, refused);
            }
        }

        /// <summary>Previews or sends; answers the message returned to the caller.</summary>
        protected abstract string Run(OneTimeSendService sender, Guid triggerId, IPluginExecutionContext context);

        /// <summary>The TriggerId input; a missing or empty id is refused before any work.</summary>
        public static Guid ReadTriggerId(IPluginExecutionContext context)
        {
            if (!context.InputParameters.Contains(TriggerIdParameter) || !(context.InputParameters[TriggerIdParameter] is Guid triggerId) || triggerId == Guid.Empty)
                throw new InvalidPluginExecutionException($"{TriggerIdParameter} is required.");
            return triggerId;
        }

        private static void RequireSurveyAdmin(IOrganizationService system, Guid userId)
        {
            if (!new OneTimeAccessCheck(system, new AdministratorCheck(system)).MaySendSurveys(userId))
                throw new InvalidPluginExecutionException($"Only a System Administrator or a user with the {OneTimeAccessCheck.SurveyAdminRoleName} role can preview or send a One-time survey.");
        }

        private static OneTimeSendService BuildSender(IOrganizationService system, ITracingService tracing)
        {
            var customer = CustomerLinkReader.Read(system);
            var pipeline = PipelineComposition.BuildPipeline(new PluginRuntime(system, customer, new SystemClock(), tracing));
            return PipelineComposition.BuildOneTimeSender(system, customer, pipeline);
        }
    }
}
