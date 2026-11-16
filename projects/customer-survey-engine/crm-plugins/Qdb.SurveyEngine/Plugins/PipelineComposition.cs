using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>What a Custom API plugin brings to the composition: the SYSTEM service, the org's customer link, a clock and its trace.</summary>
    internal sealed class PluginRuntime
    {
        public PluginRuntime(IOrganizationService system, CustomerLink customer, IClock clock, ITracingService tracing)
        {
            System = system;
            Customer = customer;
            Clock = clock;
            Tracing = tracing;
        }

        public IOrganizationService System { get; }
        public CustomerLink Customer { get; }
        public IClock Clock { get; }
        public ITracingService Tracing { get; }
    }

    /// <summary>Wires the shared invitation pipeline and the One-time sender for the Custom API plugins that run as SYSTEM.</summary>
    internal static class PipelineComposition
    {
        /// <summary>The pipeline collaborators every invitation-creating path shares.</summary>
        public static SurveyTriggerDependencies BuildPipeline(PluginRuntime runtime) =>
            new SurveyTriggerDependencies
            {
                Config = new SurveyConfigRepository(runtime.System),
                Languages = new CustomerLanguageReader(runtime.System, runtime.Customer),
                RenderCache = new CachedRenderCacheReader(new RenderCacheReader(runtime.System)),
                Invitations = new InvitationRepository(runtime.System, runtime.Customer),
                Suppressions = new SuppressionLogWriter(runtime.System, runtime.Customer),
                Clock = runtime.Clock,
                Trace = new TracingServiceTrace(runtime.Tracing),
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
