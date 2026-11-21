using System;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Integration;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>
    /// Shared plumbing of the integration Custom APIs (section 9). A caller who is a System Administrator or holds
    /// the Survey Integration role (the portal backend's application user or service account) is admitted, and the
    /// work then runs as SYSTEM, so that role needs no table rights and the account cannot read other customers'
    /// data around the APIs (review item 3, 2026-11-19). The customer is identified by the payload and checked
    /// against the invitation, never by the caller's identity.
    /// </summary>
    public abstract class IntegrationPluginBase : IPlugin
    {
        /// <summary>Plugin entry point.</summary>
        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null) throw new InvalidPluginExecutionException("serviceProvider must not be null.");
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var system = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory))).CreateOrganizationService(null);
            try
            {
                RequireAdmitted(new IntegrationAccessCheck(system, new AdministratorCheck(system)), context.InitiatingUserId);
                tracing.Trace("{0} called by user {1:D}; working as SYSTEM.", context.MessageName, context.InitiatingUserId);
                Run(new PluginCall(context, BuildDependencies(system)));
            }
            catch (SurveyApiException refusal)
            {
                tracing.Trace("{0} refused for user {1:D}: {2}", context.MessageName, context.UserId, refusal.Message);
                throw new InvalidPluginExecutionException(refusal.Message, refusal);
            }
        }

        /// <summary>Refuses a caller who is neither a System Administrator nor a holder of the Survey Integration role.</summary>
        /// <exception cref="SurveyApiException">survey_forbidden, naming the role to give the account.</exception>
        public static void RequireAdmitted(IIntegrationAccessCheck access, Guid userId)
        {
            if (access == null) throw new ArgumentNullException(nameof(access));
            if (!access.MayCallIntegrationApis(userId))
                throw new SurveyApiException(SurveyApiException.Forbidden, $"Only a System Administrator or a user with the {IntegrationAccessCheck.SurveyIntegrationRoleName} role can call the survey APIs (give the portal backend's account the {IntegrationAccessCheck.SurveyIntegrationRoleName} role).");
        }

        /// <summary>Reads the inputs, does the work and writes the outputs.</summary>
        protected abstract void Run(PluginCall call);

        private static IntegrationDependencies BuildDependencies(IOrganizationService service)
        {
            var customer = CustomerLinkReader.Read(service);
            return new IntegrationDependencies
            {
                Invitations = new IntegrationInvitationStore(service, customer),
                Forms = new PublishedFormReader(service),
                Responses = new ResponseWriter(service, customer),
                Config = new SurveyConfigRepository(service),
                Clock = new SystemClock(),
            };
        }
    }

    /// <summary>One Custom API call: typed access to its inputs and outputs, plus the services.</summary>
    public sealed class PluginCall
    {
        private readonly IPluginExecutionContext _context;

        public PluginCall(IPluginExecutionContext context, IntegrationDependencies dependencies)
        {
            _context = context ?? throw new ArgumentNullException(nameof(context));
            Dependencies = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
        }

        public IntegrationDependencies Dependencies { get; }

        /// <summary>The trimmed string input, or null when absent or blank.</summary>
        public string Text(string name)
        {
            var value = _context.InputParameters.Contains(name) ? _context.InputParameters[name] as string : null;
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        /// <summary>The input parsed as a GUID, or null when absent.</summary>
        /// <exception cref="SurveyApiException">Present but not a GUID.</exception>
        public Guid? OptionalGuid(string name)
        {
            var text = Text(name);
            if (text == null) return null;
            Guid parsed;
            if (!Guid.TryParse(text, out parsed)) throw new SurveyApiException(SurveyApiException.BadRequest, $"{name} must be a GUID; got '{text}'.");
            return parsed;
        }

        /// <summary>The identification inputs shared by get and submit.</summary>
        public InvitationRequest InvitationRequest() => new InvitationRequest
        {
            InvitationId = OptionalGuid("InvitationId"),
            CallerCustomerId = OptionalGuid("CallerCustomerId"),
            Token = Text("Token"),
        };

        public void Output(string name, object value) => _context.OutputParameters[name] = value;
    }
}
