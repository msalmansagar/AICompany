using Msst.DebtCollection.Plugins.Infrastructure;

namespace Msst.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="DefaultStatusAssigner"/>.
    ///
    /// Owns the lifecycle's starting point for <c>msst_dcpcollectioncase</c> and
    /// <c>msst_dcpptprecord</c> so the transition matrix always sees a known
    /// "from" status on the first Update.  Without this step the platform assigns
    /// <c>statuscode = 1</c>, which has no entry in the matrix and causes every
    /// first-transition attempt to be refused.
    ///
    /// Registration:
    ///   Entity:           msst_dcpcollectioncase
    ///   Message:          Create
    ///   Stage:            PreOperation (20)
    ///   Mode:             Synchronous
    ///   FilterAttributes: (none — Create has no field-level filter candidates)
    ///   Images:           none
    ///
    ///   Entity:           msst_dcpptprecord
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
