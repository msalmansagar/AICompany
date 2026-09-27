using Microsoft.Xrm.Sdk;

namespace Qdb.DebtCollection.Plugins.Infrastructure
{
    /// <summary>
    /// Carries the three CRM SDK services for a single plugin execution.
    /// Logic classes receive these via constructor injection, never via
    /// static fields or a service-locator call.
    /// </summary>
    public sealed class PluginContext
    {
        /// <summary>Gets the organization service acting as the triggering user.</summary>
        public IOrganizationService OrganizationService { get; }

        /// <summary>Gets the tracing service for diagnostic output visible in system jobs.</summary>
        public ITracingService TracingService { get; }

        /// <summary>Gets the CRM execution context for the current pipeline stage.</summary>
        public IPluginExecutionContext ExecutionContext { get; }

        /// <summary>
        /// Initialises a new <see cref="PluginContext"/> with the three required services.
        /// </summary>
        /// <param name="organizationService">Service used to read and write CRM records.</param>
        /// <param name="tracingService">Service used to emit diagnostic trace lines.</param>
        /// <param name="executionContext">Context for the current plugin execution.</param>
        public PluginContext(
            IOrganizationService organizationService,
            ITracingService tracingService,
            IPluginExecutionContext executionContext)
        {
            OrganizationService = organizationService;
            TracingService = tracingService;
            ExecutionContext = executionContext;
        }
    }
}
