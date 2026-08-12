using System;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;

namespace Msst.CmsEngine.Plugins
{
    /// <summary>
    /// Shared entry point for the CMS messages: resolves the execution context
    /// and the organisation service, and turns unexpected failures into a fault
    /// the caller can act on rather than an opaque platform error.
    /// </summary>
    public abstract class PluginBase : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null) throw new ArgumentNullException(nameof(serviceProvider));

            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            try
            {
                Run(context, service, tracing);
            }
            catch (InvalidPluginExecutionException)
            {
                // Already a message meant for the caller — do not rewrite it.
                throw;
            }
            catch (FaultException<OrganizationServiceFault> fault)
            {
                tracing.Trace("Organization service fault: {0}", fault.ToString());
                throw new InvalidPluginExecutionException(
                    GetType().Name + " failed talking to Dataverse: " + fault.Message, fault);
            }
            catch (Exception error)
            {
                tracing.Trace("Unhandled: {0}", error.ToString());
                throw new InvalidPluginExecutionException(GetType().Name + " failed: " + error.Message, error);
            }
        }

        /// <summary>Implements the message. Throw to reject.</summary>
        protected abstract void Run(
            IPluginExecutionContext context,
            IOrganizationService service,
            ITracingService tracing);

        /// <summary>Reads a required input parameter, failing loudly when absent.</summary>
        protected static T RequireInput<T>(IPluginExecutionContext context, string name)
        {
            if (!context.InputParameters.Contains(name) || context.InputParameters[name] == null)
            {
                throw new InvalidPluginExecutionException("Required parameter '" + name + "' was not supplied.");
            }
            return (T)context.InputParameters[name];
        }

        /// <summary>Reads an optional input parameter.</summary>
        protected static T OptionalInput<T>(IPluginExecutionContext context, string name, T fallback)
        {
            return context.InputParameters.Contains(name) && context.InputParameters[name] is T
                ? (T)context.InputParameters[name]
                : fallback;
        }
    }
}
