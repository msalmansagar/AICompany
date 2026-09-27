using Qdb.DebtCollection.Plugins.Infrastructure;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="ActivitySubjectComposer"/>.
    /// Registered on PreOperation, Synchronous for
    /// Create on <c>qdb_collectionactivity</c>.
    /// See REGISTRATION.md for the full step table.
    /// </summary>
    public sealed class ActivitySubjectComposerPlugin : PluginBase
    {
        /// <inheritdoc />
        protected override void ExecuteCore(PluginContext context)
        {
            new ActivitySubjectComposer(
                context.OrganizationService,
                context.TracingService,
                context.ExecutionContext)
                .ComposeSubject();
        }
    }
}
