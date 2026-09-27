using Qdb.DebtCollection.Plugins.Domain;
using Qdb.DebtCollection.Plugins.Infrastructure;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="StatusTransitionValidator"/>.
    /// Registered on PreOperation, Synchronous for <c>statuscode</c> changes on
    /// <c>qdb_collectioncase</c> and <c>qdb_ptpstatus</c> changes on
    /// <c>qdb_collectionactivity</c>.
    ///
    /// The step's unsecure configuration names the customer column that signals a contact hold
    /// (<c>holdAttribute=...</c>); with no configuration the transition matrix is still enforced
    /// and the hold guard stays inactive. See REGISTRATION.md for the full step table.
    /// </summary>
    public sealed class StatusTransitionValidatorPlugin : PluginBase
    {
        /// <summary>Initialises the plugin for a step registered without configuration.</summary>
        public StatusTransitionValidatorPlugin()
        {
        }

        /// <summary>Initialises the plugin from the step's configuration strings.</summary>
        /// <param name="unsecureConfiguration">Carries <c>holdAttribute=&lt;logical name&gt;</c>.</param>
        /// <param name="secureConfiguration">Unused by this step.</param>
        public StatusTransitionValidatorPlugin(string? unsecureConfiguration, string? secureConfiguration)
            : base(unsecureConfiguration, secureConfiguration)
        {
        }

        /// <inheritdoc />
        protected override void ExecuteCore(PluginContext context)
        {
            new StatusTransitionValidator(context, ContactHoldSettings.Parse(UnsecureConfiguration))
                .ValidateTransition();
        }
    }
}
