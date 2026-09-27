using Qdb.DebtCollection.Plugins.Infrastructure;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="ImmutabilityGuard"/>.
    /// Registered on PreValidation, Synchronous for Update and Delete on
    /// the snapshot, activity and case entities.
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
