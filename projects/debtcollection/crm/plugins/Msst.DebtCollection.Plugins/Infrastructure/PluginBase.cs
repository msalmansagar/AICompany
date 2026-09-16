using System;
using Microsoft.Xrm.Sdk;

namespace Msst.DebtCollection.Plugins.Infrastructure
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
    /// prohibited (Article X; common.md).
    /// </summary>
    public abstract class PluginBase : IPlugin
    {
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
