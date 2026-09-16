using Msst.DebtCollection.Plugins.Infrastructure;

namespace Msst.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="StatusTransitionValidator"/>.
    /// Registered on PreOperation, Synchronous for statuscode changes on
    /// <c>msst_dcpcollectioncase</c> and <c>msst_dcpptprecord</c>.
    /// See REGISTRATION.md for the full step table.
    /// </summary>
    public sealed class StatusTransitionValidatorPlugin : PluginBase
    {
        /// <inheritdoc />
        protected override void ExecuteCore(PluginContext context)
        {
            new StatusTransitionValidator(
                context.OrganizationService,
                context.TracingService,
                context.ExecutionContext)
                .ValidateTransition();
        }
    }
}
