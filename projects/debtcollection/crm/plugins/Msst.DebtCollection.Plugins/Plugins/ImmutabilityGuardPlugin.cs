using Msst.DebtCollection.Plugins.Infrastructure;

namespace Msst.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="ImmutabilityGuard"/>.
    /// Registered on PreValidation, Synchronous for Update and Delete on
    /// snapshot, audit log, and activity entities.
    /// See REGISTRATION.md for the full step table.
    /// </summary>
    public sealed class ImmutabilityGuardPlugin : PluginBase
    {
        /// <inheritdoc />
        protected override void ExecuteCore(PluginContext context)
        {
            new ImmutabilityGuard(
                context.OrganizationService,
                context.TracingService,
                context.ExecutionContext)
                .Guard();
        }
    }
}
