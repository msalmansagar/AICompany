using Qdb.DebtCollection.Plugins.Infrastructure;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="ActivityProvenanceGuard"/>.
    ///
    /// Registered PreOperation, Synchronous, for Create on <c>qdb_collectionactivity</c>, and for
    /// Update filtered to <c>qdb_origin,qdb_strategyactionid</c> with a PreImage carrying those two
    /// columns. See REGISTRATION.md for the full step table.
    /// </summary>
    public sealed class ActivityProvenanceGuardPlugin : PluginBase
    {
        /// <inheritdoc />
        protected override void ExecuteCore(PluginContext context)
        {
            new ActivityProvenanceGuard(context.TracingService, context.ExecutionContext).Guard();
        }
    }
}
