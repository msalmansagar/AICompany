using System;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>
    /// The one generic trigger plugin (section 6, ADR-006). Registered per source table as an
    /// async post-operation step on Create and on Update (filtered to the status field, with a
    /// pre-image named <see cref="PreImageName"/> holding the status). Async, so a survey problem
    /// can never block or roll back the request save (FR-CSE-030).
    /// </summary>
    public sealed class SurveyTriggerPlugin : IPlugin
    {
        /// <summary>The pre-image alias the Update step must register.</summary>
        public const string PreImageName = "PreImage";

        /// <summary>Plugin entry point.</summary>
        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null) throw new InvalidPluginExecutionException("serviceProvider must not be null.");
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var change = ReadChange(context);
            if (change == null) { tracing.Trace("SurveyTriggerPlugin: message {0} on {1} is not handled.", context.MessageName, context.PrimaryEntityName); return; }
            // SYSTEM context: the user who saved the request needs no survey-table privileges.
            var service = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory))).CreateOrganizationService(null);
            BuildService(service, PreImageOf(context), tracing).Handle(change);
        }

        /// <summary>The change described by the pipeline context, or null for a message the plugin ignores.</summary>
        public static RecordChange ReadChange(IPluginExecutionContext context)
        {
            ChangeMessage message;
            if (!Enum.TryParse(context.MessageName, out message)) return null;
            if (context.PrimaryEntityId == Guid.Empty) return null;
            return new RecordChange { Message = message, TableLogicalName = context.PrimaryEntityName, RecordId = context.PrimaryEntityId };
        }

        private static Entity PreImageOf(IPluginExecutionContext context) =>
            context.PreEntityImages != null && context.PreEntityImages.Contains(PreImageName) ? context.PreEntityImages[PreImageName] : null;

        private static SurveyTriggerService BuildService(IOrganizationService service, Entity preImage, ITracingService tracing) =>
            new SurveyTriggerService(new SurveyTriggerDependencies
            {
                Config = new SurveyConfigRepository(service),
                Records = new SourceRecordReader(service, preImage),
                Languages = new CustomerLanguageReader(service),
                RenderCache = new RenderCacheReader(service),
                Milestones = new MilestoneCounter(service),
                Invitations = new InvitationRepository(service),
                Suppressions = new SuppressionLogWriter(service),
                Clock = new SystemClock(),
                Trace = new TracingServiceTrace(tracing),
            });
    }

    /// <summary>The real clock.</summary>
    public sealed class SystemClock : IClock
    {
        public DateTime UtcNow => DateTime.UtcNow;
    }

    /// <summary>Routes service trace output to the CRM plugin trace log.</summary>
    public sealed class TracingServiceTrace : ITrace
    {
        private readonly ITracingService _tracing;

        public TracingServiceTrace(ITracingService tracing)
        {
            _tracing = tracing ?? throw new ArgumentNullException(nameof(tracing));
        }

        public void Write(string message) => _tracing.Trace("{0}", message);
    }
}
