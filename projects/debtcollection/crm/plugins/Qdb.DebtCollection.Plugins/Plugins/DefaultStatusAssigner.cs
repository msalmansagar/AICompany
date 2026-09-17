using Microsoft.Xrm.Sdk;
using Qdb.DebtCollection.Plugins.Domain;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// Ensures every new <c>qdb_collectioncase</c> and <c>qdb_collectionactivity</c>
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
    ///   <item><c>qdb_collectioncase</c> → <see cref="StatusTransitionMatrix.CaseStatus.New"/></item>
    ///   <item><c>qdb_collectionactivity</c> → <see cref="StatusTransitionMatrix.ActivityStatus.Open"/></item>
    /// </list>
    /// A caller that supplies a valid custom status code (anything other than 1) has
    /// that code honoured and it is left untouched.
    ///
    /// An activity that carries a promise date also gets its promise lifecycle opened at
    /// <see cref="StatusTransitionMatrix.PtpStatus.Active"/>, for the same reason: promise-to-pay
    /// is an activity type in the canonical schema, and a promise with no status is not a node in
    /// the PTP matrix either.
    ///
    /// Registered: Create, PreOperation (20), Synchronous.
    /// No pre-image or filtering attributes are required.
    /// See REGISTRATION.md §2 for the full step table.
    /// </summary>
    public sealed class DefaultStatusAssigner
    {
        private const string EntityCase = "qdb_collectioncase";
        private const string EntityActivity = "qdb_collectionactivity";
        private const string AttrStatusCode = "statuscode";
        private const string AttrPtpStatus = "qdb_ptpstatus";
        private const string AttrPtpDate = "qdb_ptpdate";

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
            else if (_context.PrimaryEntityName == EntityActivity)
                AssignActivityDefaultStatus(target);
        }

        private void AssignCaseDefaultStatus(Entity target)
        {
            if (!RequiresDefaultStatus(target)) return;

            target[AttrStatusCode] = new OptionSetValue(StatusTransitionMatrix.CaseStatus.New);
            _tracing.Trace(
                $"DefaultStatusAssigner: case statuscode absent or platform default — " +
                $"set to New ({StatusTransitionMatrix.CaseStatus.New})");
        }

        private void AssignActivityDefaultStatus(Entity target)
        {
            if (RequiresDefaultStatus(target))
            {
                target[AttrStatusCode] = new OptionSetValue(StatusTransitionMatrix.ActivityStatus.Open);
                _tracing.Trace(
                    $"DefaultStatusAssigner: activity statuscode absent or platform default — " +
                    $"set to Open ({StatusTransitionMatrix.ActivityStatus.Open})");
            }

            AssignPromiseDefaultStatus(target);
        }

        /// <summary>
        /// Opens the promise lifecycle on an activity that carries a promise date but no promise
        /// status. An activity without a promise date is not a promise to pay and is left alone.
        /// </summary>
        private void AssignPromiseDefaultStatus(Entity target)
        {
            if (!target.Contains(AttrPtpDate)) return;
            if (target.GetAttributeValue<OptionSetValue>(AttrPtpStatus) != null) return;

            target[AttrPtpStatus] = new OptionSetValue(StatusTransitionMatrix.PtpStatus.Active);
            _tracing.Trace(
                $"DefaultStatusAssigner: promise date present without a promise status — " +
                $"set to Active ({StatusTransitionMatrix.PtpStatus.Active})");
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
