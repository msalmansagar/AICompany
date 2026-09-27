using Qdb.DebtCollection.Plugins.Infrastructure;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="DefaultStatusAssigner"/>.
    ///
    /// Owns the lifecycle's starting point for <c>qdb_collectioncase</c> and
    /// <c>qdb_collectionactivity</c> so the transition matrix always sees a known
    /// "from" status on the first Update.  Without this step the platform assigns
    /// <c>statuscode = 1</c>, which has no entry in the matrix and causes every
    /// first-transition attempt to be refused.
    ///
    /// Registration:
    ///   Entity:           qdb_collectioncase
    ///   Message:          Create
    ///   Stage:            PreOperation (20)
    ///   Mode:             Synchronous
    ///   FilterAttributes: (none — Create has no field-level filter candidates)
    ///   Images:           none
    ///
    ///   Entity:           qdb_collectionactivity
    ///   Message:          Create
    ///   Stage:            PreOperation (20)
    ///   Mode:             Synchronous
    ///   FilterAttributes: (none)
    ///   Images:           none
    ///
    /// See REGISTRATION.md §2 for the full step table.
    /// </summary>
    public sealed class DefaultStatusAssignerPlugin : PluginBase
    {
        /// <inheritdoc />
        protected override void ExecuteCore(PluginContext context)
        {
            new DefaultStatusAssigner(
                context.OrganizationService,
                context.TracingService,
                context.ExecutionContext)
                .AssignDefaultStatus();
        }
    }
}
