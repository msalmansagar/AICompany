using Microsoft.Xrm.Sdk;
using Msst.DebtCollection.Plugins.Domain;

namespace Msst.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// Ensures every new <c>msst_dcpcollectioncase</c> and <c>msst_dcpptprecord</c>
    /// record starts with a <c>statuscode</c> that the transition matrix recognises.
    ///
    /// The CRM platform assigns <c>statuscode = 1</c> (its built-in "Active" sentinel)
    /// when no explicit value is supplied on Create.  This value is not a node in the
    /// DCP transition matrix, so every first Update on such a record is refused with
    /// "Transition from '1' to '...' is not permitted."
    ///
    /// This plugin runs on Create, PreOperation, Synchronous to intercept the record
    /// before it is written.  If the target carries no <c>statuscode</c>, or carries
    /// the platform sentinel <c>1</c>, the assigner replaces the value with the semantic
    /// starting point defined in <see cref="StatusTransitionMatrix"/>:
    /// <list type="bullet">
    ///   <item><c>msst_dcpcollectioncase</c> → <see cref="StatusTransitionMatrix.CaseStatus.New"/></item>
    ///   <item><c>msst_dcpptprecord</c> → <see cref="StatusTransitionMatrix.PtpStatus.Open"/></item>
    /// </list>
    /// A caller that supplies a valid custom status code (anything other than 1) has
    /// that code honoured and it is left untouched.
    ///
    /// Registered: Create, PreOperation (20), Synchronous.
    /// No pre-image or filtering attributes are required.
    /// See REGISTRATION.md §2 for the full step table.
    /// </summary>
    public sealed class DefaultStatusAssigner
    {
        private const string EntityCase = "msst_dcpcollectioncase";
        private const string EntityPtp = "msst_dcpptprecord";
        private const string AttrStatusCode = "statuscode";

        /// <summary>
        /// The value the CRM platform assigns on Create when the caller supplies no
        /// explicit <c>statuscode</c>.  It maps to the built-in "Active" option-set
        /// label and is not a node in the DCP transition matrix (GOT-011).
        /// </summary>
        private const int PlatformDefaultStatusCode = 1;

        private readonly ITracingService _tracing;
        private readonly IPluginExecutionContext _context;

        /// <summary>
        /// Initialises the assigner with the required SDK services.
        /// <paramref name="service"/> is accepted for interface consistency with
        /// other logic classes but is not used — the assigner writes only to
        /// <c>InputParameters["Target"]</c>.
        /// </summary>
        public DefaultStatusAssigner(
            IOrganizationService service,
            ITracingService tracing,
            IPluginExecutionContext context)
        {
            _ = service;
            _tracing = tracing;
            _context = context;
        }

        /// <summary>
        /// Assigns the semantic default status code to the target when it lacks one
        /// or carries the platform default.  Exits immediately when the caller has
        /// already supplied a valid custom status code.
        /// </summary>
        public void AssignDefaultStatus()
        {
            var target = (Entity)_context.InputParameters["Target"];

            if (_context.PrimaryEntityName == EntityCase)
                AssignCaseDefaultStatus(target);
            else if (_context.PrimaryEntityName == EntityPtp)
                AssignPtpDefaultStatus(target);
        }

        private void AssignCaseDefaultStatus(Entity target)
        {
            if (!RequiresDefaultStatus(target)) return;

            target[AttrStatusCode] = new OptionSetValue(StatusTransitionMatrix.CaseStatus.New);
            _tracing.Trace(
                $"DefaultStatusAssigner: case statuscode absent or platform default — " +
                $"set to New ({StatusTransitionMatrix.CaseStatus.New})");
        }

        private void AssignPtpDefaultStatus(Entity target)
        {
            if (!RequiresDefaultStatus(target)) return;

            target[AttrStatusCode] = new OptionSetValue(StatusTransitionMatrix.PtpStatus.Open);
            _tracing.Trace(
                $"DefaultStatusAssigner: PTP statuscode absent or platform default — " +
                $"set to Open ({StatusTransitionMatrix.PtpStatus.Open})");
        }

        /// <summary>
        /// Returns <c>true</c> when the target requires the default status code to be
        /// assigned.  This is the case when <c>statuscode</c> is absent from the
        /// target, is null, or equals the platform-assigned sentinel
        /// <see cref="PlatformDefaultStatusCode"/>.
        /// </summary>
        private static bool RequiresDefaultStatus(Entity target)
        {
            if (!target.Contains(AttrStatusCode)) return true;
            var value = target.GetAttributeValue<OptionSetValue>(AttrStatusCode);
            return value == null || value.Value == PlatformDefaultStatusCode;
        }
    }
}
