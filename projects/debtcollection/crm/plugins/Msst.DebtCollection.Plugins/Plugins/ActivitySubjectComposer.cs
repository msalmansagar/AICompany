using System;
using Microsoft.Xrm.Sdk;

namespace Msst.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// Composes a meaningful <c>subject</c> field on Create for the two custom
    /// activity types: <c>msst_dcpcollectionaction</c> and
    /// <c>msst_dcpcommunication</c> (§4.2; ADR-DCP-01 §binding constraint 2).
    ///
    /// Subject format:
    /// <list type="bullet">
    ///   <item>CollectionAction: <c>"Collection {ActionTypeLabel} – YYYY-MM-DD"</c></item>
    ///   <item>Communication:   <c>"Communication ({ChannelLabel}) – YYYY-MM-DD"</c></item>
    /// </list>
    ///
    /// Option-set code-to-label mappings are static approximations.
    /// REGISTRATION.md §4 documents which provisioned codes must match.
    ///
    /// Registered: PreOperation, Synchronous — modifies Target before the platform
    /// persists the record.
    /// </summary>
    public sealed class ActivitySubjectComposer
    {
        private const string EntityAction = "msst_dcpcollectionaction";
        private const string AttrActionType = "msst_actiontype";
        private const string AttrChannel = "msst_channel";

        private readonly ITracingService _tracing;
        private readonly IPluginExecutionContext _context;

        /// <summary>
        /// Initialises the composer with the three required SDK services.
        /// </summary>
        public ActivitySubjectComposer(
            IOrganizationService service,
            ITracingService tracing,
            IPluginExecutionContext context)
        {
            _ = service;
            _tracing = tracing;
            _context = context;
        }

        /// <summary>Writes the composed subject to the Target entity in InputParameters.</summary>
        public void ComposeSubject()
        {
            var target = (Entity)_context.InputParameters["Target"];

            var subject = _context.PrimaryEntityName == EntityAction
                ? ComposeActionSubject(target)
                : ComposeCommunicationSubject(target);

            target["subject"] = subject;
            _tracing.Trace($"ActivitySubjectComposer: subject set to '{subject}'");
        }

        private static string ComposeActionSubject(Entity target)
        {
            var typeValue = target.GetAttributeValue<OptionSetValue>(AttrActionType);
            var typeLabel = typeValue != null ? GetActionTypeLabel(typeValue.Value) : "Action";
            return $"Collection {typeLabel} – {DateTime.UtcNow:yyyy-MM-dd}";
        }

        private static string ComposeCommunicationSubject(Entity target)
        {
            var channelValue = target.GetAttributeValue<OptionSetValue>(AttrChannel);
            var channelLabel = channelValue != null ? GetChannelLabel(channelValue.Value) : "Communication";
            return $"Communication ({channelLabel}) – {DateTime.UtcNow:yyyy-MM-dd}";
        }

        /// <summary>
        /// Maps <c>msst_actiontype</c> option-set codes to display labels.
        /// Codes are the values provisioned under the MSST publisher (base 463270000), verified by read-back on 2026-09-15.
        /// Verify against provisioned schema — see REGISTRATION.md §4.
        /// </summary>
        private static string GetActionTypeLabel(int code) => code switch
        {
            463270081 => "Call",
            463270082 => "Meeting",
            463270083 => "Supervisor Review",
            463270084 => "Field Visit",
            463270085 => "Manual Note",
            _ => $"Action/{code}",
        };

        /// <summary>
        /// Maps <c>msst_channel</c> option-set codes to display labels.
        /// Codes are the values provisioned under the MSST publisher (base 463270000), verified by read-back on 2026-09-15.
        /// Verify against provisioned schema — see REGISTRATION.md §4.
        /// </summary>
        private static string GetChannelLabel(int code) => code switch
        {
            463270021 => "SMS",
            463270022 => "Email",
            463270023 => "Official Letter",
            463270024 => "Call",
            100000003 => "Call",
            _ => $"Channel/{code}",
        };
    }
}
