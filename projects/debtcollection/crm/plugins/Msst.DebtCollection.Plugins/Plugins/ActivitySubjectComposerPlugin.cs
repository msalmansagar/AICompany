using Msst.DebtCollection.Plugins.Infrastructure;

namespace Msst.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="ActivitySubjectComposer"/>.
    /// Registered on PreOperation, Synchronous for Create on
    /// <c>msst_dcpcollectionaction</c> and <c>msst_dcpcommunication</c>.
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
