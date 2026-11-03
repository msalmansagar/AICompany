using System;
using Microsoft.Xrm.Sdk;

namespace Qdb.DebtCollection.Plugins.Infrastructure
{
    /// <summary>
    /// Generic base for all DCP plugins.
    /// Resolves <see cref="IOrganizationService"/>, <see cref="ITracingService"/>,
    /// and <see cref="IPluginExecutionContext"/> from the <see cref="IServiceProvider"/>,
    /// wraps them in a <see cref="PluginContext"/>, and delegates to
    /// <see cref="ExecuteCore"/>.
    ///
    /// Subclasses must not hold instance state between executions.
    /// Plugin instances are cached by the sandbox; static variables are
    /// prohibited (Article X; common.md). The two configuration strings are the one
    /// exception: the platform supplies them at construction and they are fixed for the
    /// life of a step registration, so they are immutable per-registration settings
    /// rather than per-execution state.
    /// </summary>
    public abstract class PluginBase : IPlugin
    {
        /// <summary>Gets the step's unsecure configuration, or <c>null</c> when none is registered.</summary>
        protected string? UnsecureConfiguration { get; }

        /// <summary>Gets the step's secure configuration, or <c>null</c> when none is registered.</summary>
        protected string? SecureConfiguration { get; }

        /// <summary>Initialises a plugin registered without step configuration.</summary>
        protected PluginBase()
        {
        }

        /// <summary>
        /// Initialises a plugin from the configuration strings supplied by the platform at
        /// registration time. The platform selects this constructor when either string is set.
        /// </summary>
        /// <param name="unsecureConfiguration">Configuration visible to anyone who can read the step.</param>
        /// <param name="secureConfiguration">Configuration readable only by privileged callers.</param>
        protected PluginBase(string? unsecureConfiguration, string? secureConfiguration)
        {
            UnsecureConfiguration = unsecureConfiguration;
            SecureConfiguration = secureConfiguration;
        }

        /// <inheritdoc />
        public void Execute(IServiceProvider serviceProvider)
        {
            var executionContext = (IPluginExecutionContext)
                serviceProvider.GetService(typeof(IPluginExecutionContext));

            var serviceFactory = (IOrganizationServiceFactory)
                serviceProvider.GetService(typeof(IOrganizationServiceFactory));

            var tracingService = (ITracingService)
                serviceProvider.GetService(typeof(ITracingService));

            var organizationService = serviceFactory.CreateOrganizationService(executionContext.UserId);

            ExecuteCore(new PluginContext(organizationService, tracingService, executionContext));
        }

        /// <summary>
        /// Invoked with a fully-constructed <see cref="PluginContext"/> after the base
        /// class has resolved all services. Subclasses implement all business logic here.
        /// </summary>
        /// <param name="context">Services and execution metadata for this invocation.</param>
        protected abstract void ExecuteCore(PluginContext context);
    }
}
