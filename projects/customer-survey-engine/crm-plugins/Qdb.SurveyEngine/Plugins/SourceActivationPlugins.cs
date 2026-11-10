using System;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.Data;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>Custom API qdb_srv_ActivateSource (A3): input SourceId (Guid), output Message (string).</summary>
    public sealed class ActivateSourcePlugin : SourceActivationPluginBase
    {
        protected override string Run(SourceActivationService service, Guid sourceId, Guid callerId) => service.Activate(sourceId, callerId);
    }

    /// <summary>Custom API qdb_srv_DeactivateSource (A3): input SourceId (Guid), output Message (string).</summary>
    public sealed class DeactivateSourcePlugin : SourceActivationPluginBase
    {
        protected override string Run(SourceActivationService service, Guid sourceId, Guid callerId) => service.Deactivate(sourceId, callerId);
    }

    /// <summary>
    /// Shared Custom API plumbing. The caller is the initiating user (checked for System
    /// Administrator); the work runs as SYSTEM because step registration needs it. A refusal is
    /// returned to the caller as an error with the reason.
    /// </summary>
    public abstract class SourceActivationPluginBase : IPlugin
    {
        public const string SourceIdParameter = "SourceId";
        public const string MessageProperty = "Message";

        /// <summary>Plugin entry point.</summary>
        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null) throw new InvalidPluginExecutionException("serviceProvider must not be null.");
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var sourceId = ReadSourceId(context);
            var system = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory))).CreateOrganizationService(null);
            try
            {
                var message = Run(BuildService(system), sourceId, context.InitiatingUserId);
                tracing.Trace("{0}", message);
                context.OutputParameters[MessageProperty] = message;
            }
            catch (ActivationRefusedException refused)
            {
                tracing.Trace("Refused for user {0:D}: {1}", context.InitiatingUserId, refused.Message);
                throw new InvalidPluginExecutionException(refused.Message, refused);
            }
        }

        /// <summary>Activates or deactivates; answers the summary returned to the caller.</summary>
        protected abstract string Run(SourceActivationService service, Guid sourceId, Guid callerId);

        /// <summary>The SourceId input; a missing or empty id is refused before any work.</summary>
        public static Guid ReadSourceId(IPluginExecutionContext context)
        {
            if (!context.InputParameters.Contains(SourceIdParameter) || !(context.InputParameters[SourceIdParameter] is Guid sourceId) || sourceId == Guid.Empty)
                throw new InvalidPluginExecutionException($"{SourceIdParameter} is required.");
            return sourceId;
        }

        private static SourceActivationService BuildService(IOrganizationService system) =>
            new SourceActivationService(new ActivationDependencies
            {
                Sources = new ActivationSourceStore(system),
                Steps = new StepRegistry(system),
                Administrators = new AdministratorCheck(system),
                OptionCodes = new OptionCodeReader(system),
            });
    }
}
