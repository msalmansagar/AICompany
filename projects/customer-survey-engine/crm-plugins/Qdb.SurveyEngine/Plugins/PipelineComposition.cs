using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>Wires the shared invitation pipeline and the One-time sender for the Custom API plugins that run as SYSTEM.</summary>
    internal static class PipelineComposition
    {
        /// <summary>The pipeline collaborators every invitation-creating path shares.</summary>
        public static SurveyTriggerDependencies BuildPipeline(IOrganizationService system, CustomerLink customer, IClock clock, ITracingService tracing) =>
            new SurveyTriggerDependencies
            {
                Config = new SurveyConfigRepository(system),
                Languages = new CustomerLanguageReader(system, customer),
                RenderCache = new CachedRenderCacheReader(new RenderCacheReader(system)),
                Invitations = new InvitationRepository(system, customer),
                Suppressions = new SuppressionLogWriter(system, customer),
                Clock = clock,
                Trace = new TracingServiceTrace(tracing),
            };

        /// <summary>The One-time sender over the given pipeline.</summary>
        public static OneTimeSendService BuildOneTimeSender(IOrganizationService system, CustomerLink customer, SurveyTriggerDependencies pipeline) =>
            new OneTimeSendService(new OneTimeSendDependencies
            {
                Pipeline = pipeline,
                Triggers = new OneTimeTriggerStore(system),
                Audience = new AudienceReader(system),
                GeneratedKeys = new ScheduledInvitationReader(system),
                CustomerTable = customer.TableLogicalName,
            });
    }
}
