using Msst.DebtCollection.Plugins.Infrastructure;

namespace Msst.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="StopContactQueueMover"/>.
    /// Registered on PostOperation, Asynchronous for Update on
    /// <c>msst_dcpcustomer</c> with filter attribute <c>msst_stopcontact</c>.
    /// See REGISTRATION.md for the full step table.
    /// </summary>
    public sealed class StopContactQueueMoverPlugin : PluginBase
    {
        /// <inheritdoc />
        protected override void ExecuteCore(PluginContext context)
        {
            new StopContactQueueMover(
                context.OrganizationService,
                context.TracingService,
                context.ExecutionContext)
                .MoveToDeceasedQueue();
        }
    }
}
