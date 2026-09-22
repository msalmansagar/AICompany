using Qdb.DebtCollection.Plugins.Infrastructure;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="ActiveCaseGuard"/>.
    /// Registered on PreOperation, Synchronous for Create on <c>qdb_collectioncase</c>, and for
    /// Update filtered to <c>statecode</c> with a PreImage of <c>qdb_facilitynumber</c> and
    /// <c>qdb_facilitysourcesystem</c>. See REGISTRATION.md for the full step table.
    /// </summary>
    public sealed class ActiveCaseGuardPlugin : PluginBase
    {
        /// <inheritdoc />
        protected override void ExecuteCore(PluginContext context)
        {
            new ActiveCaseGuard(
                context.OrganizationService,
                context.TracingService,
                context.ExecutionContext)
                .Guard();
        }
    }
}
