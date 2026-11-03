using System;

namespace Qdb.DebtCollection.Plugins.Domain
{
    /// <summary>
    /// Deployment configuration for the contact-hold guard, read from the plugin step's
    /// unsecure configuration rather than compiled in.
    ///
    /// The canonical schema deliberately owns no customer master: <c>qdb_customerid</c> is a
    /// Customer lookup onto the QDB masters (<c>contact</c> for Housing Loan, <c>account</c> for
    /// BFD), which the Debt Collection Platform must not modify. Which column on those masters
    /// signals "do not contact" is therefore a property of the deployment, not of this code, and
    /// differs between organisations. When no column is configured the guard does not run and the
    /// hold decision stays where ADR-DCP-11 puts it — server-side, in the Collection and
    /// Communication services.
    /// </summary>
    public sealed class ContactHoldSettings
    {
        private const string HoldAttributeKey = "holdAttribute";
        private const string SuppressionQueueKey = "suppressionQueue";

        /// <summary>
        /// Queue used when no other is configured. Named, never resolved by id: a GUID would not
        /// survive the move between organisations (Article V; ARC-M-001).
        /// </summary>
        public const string DefaultSuppressionQueueName = "Deceased & Insurance";

        /// <summary>Settings with no hold column configured: the plugin-side guard is inactive.</summary>
        public static readonly ContactHoldSettings NotConfigured = new ContactHoldSettings(null, null);

        /// <summary>
        /// Logical name of the boolean column on the customer record that signals a contact hold,
        /// or <c>null</c> when the deployment has not configured one.
        /// </summary>
        public string? HoldAttribute { get; }

        /// <summary>Name of the queue that holds cases suppressed by a contact hold.</summary>
        public string SuppressionQueueName { get; }

        /// <summary>Gets a value indicating whether the plugin-side guard should run.</summary>
        public bool IsConfigured => !string.IsNullOrWhiteSpace(HoldAttribute);

        /// <summary>Initialises settings for the given hold column and suppression queue.</summary>
        /// <param name="holdAttribute">Logical name of the hold column, or <c>null</c>.</param>
        /// <param name="suppressionQueueName">Queue name, or <c>null</c> for the default.</param>
        public ContactHoldSettings(string? holdAttribute, string? suppressionQueueName)
        {
            HoldAttribute = string.IsNullOrWhiteSpace(holdAttribute) ? null : holdAttribute!.Trim();
            SuppressionQueueName = string.IsNullOrWhiteSpace(suppressionQueueName)
                ? DefaultSuppressionQueueName
                : suppressionQueueName!.Trim();
        }

        /// <summary>
        /// Parses the step's unsecure configuration, which carries one
        /// <c>key=value</c> pair per line. Unknown keys are ignored so that a step registered with
        /// a richer configuration than this version understands still starts.
        /// </summary>
        /// <param name="unsecureConfiguration">Raw configuration string from the step registration.</param>
        /// <returns>The parsed settings, or <see cref="NotConfigured"/> when the key is absent.</returns>
        public static ContactHoldSettings Parse(string? unsecureConfiguration)
        {
            if (string.IsNullOrWhiteSpace(unsecureConfiguration)) return NotConfigured;

            string? holdAttribute = null;
            string? suppressionQueue = null;

            foreach (var line in unsecureConfiguration!.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var separatorIndex = line.IndexOf('=');
                if (separatorIndex <= 0) continue;

                var key = line.Substring(0, separatorIndex).Trim();
                var value = line.Substring(separatorIndex + 1);

                if (key.Equals(HoldAttributeKey, StringComparison.OrdinalIgnoreCase)) holdAttribute = value;
                else if (key.Equals(SuppressionQueueKey, StringComparison.OrdinalIgnoreCase)) suppressionQueue = value;
            }

            return new ContactHoldSettings(holdAttribute, suppressionQueue);
        }
    }
}
