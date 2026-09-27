using Qdb.DebtCollection.Plugins.Domain;
using Qdb.DebtCollection.Plugins.Infrastructure;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="StopContactQueueMover"/>.
    /// Registered on PostOperation, Asynchronous for Update on the QDB customer master that
    /// carries the contact-hold column, with that column as the filter attribute.
    ///
    /// The step's unsecure configuration names the column and, optionally, the suppression queue
    /// (<c>holdAttribute=...</c>, <c>suppressionQueue=...</c>). Without it the mover does nothing,
    /// so registering the step before QDB confirms the column is harmless.
    /// See REGISTRATION.md for the full step table.
    /// </summary>
    public sealed class StopContactQueueMoverPlugin : PluginBase
    {
        /// <summary>Initialises the plugin for a step registered without configuration.</summary>
        public StopContactQueueMoverPlugin()
        {
        }

        /// <summary>Initialises the plugin from the step's configuration strings.</summary>
        /// <param name="unsecureConfiguration">Carries <c>holdAttribute</c> and <c>suppressionQueue</c>.</param>
        /// <param name="secureConfiguration">Unused by this step.</param>
        public StopContactQueueMoverPlugin(string? unsecureConfiguration, string? secureConfiguration)
            : base(unsecureConfiguration, secureConfiguration)
        {
        }

        /// <inheritdoc />
        protected override void ExecuteCore(PluginContext context)
        {
            new StopContactQueueMover(context, ContactHoldSettings.Parse(UnsecureConfiguration))
                .MoveToDeceasedQueue();
        }
    }
}
