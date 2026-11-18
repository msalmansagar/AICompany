using System;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>
    /// What a Custom API plugin brings to the composition: the SYSTEM service, the org's customer link, a clock,
    /// its trace, and the user the call runs for (recorded as who started a One-time send, AUD-D-01).
    /// </summary>
    internal sealed class PluginRuntime
    {
        public IOrganizationService System { get; set; }
        public CustomerLink Customer { get; set; }
        public IClock Clock { get; set; }
        public ITracingService Tracing { get; set; }
        public Guid CallerId { get; set; }
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

        /// <summary>The One-time sender for this call, over its own pipeline.</summary>
        public static OneTimeSendService BuildOneTimeSender(PluginRuntime runtime) =>
            new OneTimeSendService(new OneTimeSendDependencies
            {
                Pipeline = BuildPipeline(runtime),
                Triggers = new OneTimeTriggerStore(runtime.System),
                Audience = new AudienceReader(runtime.System),
                GeneratedKeys = new ScheduledInvitationReader(runtime.System),
                CustomerTable = runtime.Customer.TableLogicalName,
                StartedBy = runtime.CallerId,
            });
    }
}
