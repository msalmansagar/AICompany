using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.DebtCollection.Plugins.Domain;
using Qdb.DebtCollection.Plugins.Infrastructure;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// Rejects status changes that fall outside the allowed-transition matrices in
    /// <see cref="StatusTransitionMatrix"/> (FR-023; appendix paragraphs B.1 and B.2):
    /// <c>statuscode</c> on <c>qdb_collectioncase</c>, and <c>qdb_ptpstatus</c> on
    /// <c>qdb_collectionactivity</c> — promise-to-pay is an activity type in the canonical
    /// schema, so its lifecycle lives on its own choice column.
    ///
    /// For collection cases the validator also enforces the contact-hold guard
    /// (FR-043/097, section 14.2 decision 1b): a transition into any contact-bearing state is
    /// rejected when the customer referenced by <c>qdb_customerid</c> carries the configured hold
    /// column, with the sole exception of a move to Deceased/Insurance Review. The column is named
    /// by the step's unsecure configuration (see <see cref="ContactHoldSettings"/>) because the
    /// customer master belongs to QDB, not to this platform; with nothing configured the guard is
    /// inactive and the hold decision stays in the Collection services (ADR-DCP-11).
    ///
    /// The customer record is retrieved through the <c>EntityReference</c> already on the case, so
    /// the guard works unchanged whether the Customer lookup resolves to a <c>contact</c> (Housing
    /// Loan) or an <c>account</c> (BFD). Cost: one indexed primary-key Retrieve of a single column.
    ///
    /// Registered: PreOperation, Synchronous -- runs inside the transaction so the
    /// invalid write is rolled back before it persists.  Uses a PreImage named
    /// "PreImage" with the status column and <c>qdb_customerid</c> so no extra
    /// case Retrieve is needed.
    /// </summary>
    public sealed class StatusTransitionValidator
    {
        private const string EntityCase = "qdb_collectioncase";
        private const string EntityActivity = "qdb_collectionactivity";
        private const string AttrCaseStatus = "statuscode";
        private const string AttrPtpStatus = "qdb_ptpstatus";
        private const string AttrCustomerId = "qdb_customerid";
        private const string PreImageAlias = "PreImage";

        /// <summary>
        /// The value the CRM platform assigns on Create when no explicit statuscode is
        /// supplied.  Records created before <see cref="DefaultStatusAssigner"/> was
        /// deployed may carry this sentinel in their pre-image.  It is not a node in
        /// the transition matrix, so without normalisation any first-transition attempt
        /// on those records would be refused.  <see cref="NormalizeCaseFromStatus"/> and
        /// <see cref="NormalizePtpFromStatus"/> replace it with the semantic starting point.
        /// </summary>
        private const int PlatformDefaultStatusCode = 1;

        private readonly IOrganizationService _service;
        private readonly ITracingService _tracing;
        private readonly IPluginExecutionContext _context;
        private readonly ContactHoldSettings _contactHold;

        /// <summary>
        /// Initialises the validator with the execution services and the deployment's
        /// contact-hold configuration.
        /// </summary>
        /// <param name="context">Services and execution metadata for this invocation.</param>
        /// <param name="contactHold">Which customer column, if any, signals a contact hold.</param>
        public StatusTransitionValidator(PluginContext context, ContactHoldSettings contactHold)
        {
            _service = context.OrganizationService;
            _tracing = context.TracingService;
            _context = context.ExecutionContext;
            _contactHold = contactHold ?? ContactHoldSettings.NotConfigured;
        }

        /// <summary>
        /// Validates the status transition for the current entity and message.
        /// Throws <see cref="InvalidPluginExecutionException"/> with a descriptive
        /// message when the transition is not permitted, or when a customer on hold
        /// is moved into a contact-bearing case state.
        /// </summary>
        public void ValidateTransition()
        {
            var target = (Entity)_context.InputParameters["Target"];

            if (_context.PrimaryEntityName == EntityCase)
                ValidateCaseTransition(target);
            else if (_context.PrimaryEntityName == EntityActivity)
                ValidatePtpTransition(target);
        }

        private void ValidateCaseTransition(Entity target)
        {
            if (!target.Contains(AttrCaseStatus)) return;

            var toCode = target.GetAttributeValue<OptionSetValue>(AttrCaseStatus)?.Value
                ?? throw new InvalidPluginExecutionException("Case statuscode value is null.");

            var rawFromCode = ReadPreImageStatusCode(AttrCaseStatus);
            if (rawFromCode == null) return; // no pre-image registered; allow and log

            var fromCode = NormalizeCaseFromStatus(rawFromCode.Value);

            _tracing.Trace($"StatusTransitionValidator: case {fromCode} -> {toCode}");

            if (!StatusTransitionMatrix.IsCaseTransitionAllowed(fromCode, toCode))
                ThrowInvalidTransition(
                    StatusTransitionMatrix.GetCaseStatusName(fromCode),
                    StatusTransitionMatrix.GetCaseStatusName(toCode));

            EnforceContactHoldGuard(target, toCode);
        }

        private void ValidatePtpTransition(Entity target)
        {
            if (!target.Contains(AttrPtpStatus)) return;

            var toCode = target.GetAttributeValue<OptionSetValue>(AttrPtpStatus)?.Value
                ?? throw new InvalidPluginExecutionException("PTP status value is null.");

            var rawFromCode = ReadPreImageStatusCode(AttrPtpStatus);
            if (rawFromCode == null) return;

            var fromCode = NormalizePtpFromStatus(rawFromCode.Value);

            _tracing.Trace($"StatusTransitionValidator: PTP {fromCode} -> {toCode}");

            if (!StatusTransitionMatrix.IsPtpTransitionAllowed(fromCode, toCode))
                ThrowInvalidTransition(
                    StatusTransitionMatrix.GetPtpStatusName(fromCode),
                    StatusTransitionMatrix.GetPtpStatusName(toCode));
        }

        /// <summary>
        /// Replaces the platform default sentinel <see cref="PlatformDefaultStatusCode"/>
        /// with <see cref="StatusTransitionMatrix.CaseStatus.New"/> so records created
        /// before <see cref="DefaultStatusAssigner"/> was deployed are not permanently
        /// stuck -- their first valid transition is New to Assigned.
        /// </summary>
        private static int NormalizeCaseFromStatus(int rawCode) =>
            rawCode == PlatformDefaultStatusCode
                ? StatusTransitionMatrix.CaseStatus.New
                : rawCode;

        /// <summary>
        /// Replaces the platform default sentinel <see cref="PlatformDefaultStatusCode"/>
        /// with <see cref="StatusTransitionMatrix.PtpStatus.Active"/> for the same reason
        /// as <see cref="NormalizeCaseFromStatus"/>.
        /// </summary>
        private static int NormalizePtpFromStatus(int rawCode) =>
            rawCode == PlatformDefaultStatusCode
                ? StatusTransitionMatrix.PtpStatus.Active
                : rawCode;

        /// <summary>
        /// Blocks a transition into a contact-bearing state when the customer linked to this case
        /// carries the configured hold column (FR-043/097). Deceased/Insurance Review is not in the
        /// contact-bearing set and is therefore always reachable regardless of the flag (explicit
        /// carve-out). The guard is skipped when no hold column is configured for the deployment or
        /// when the case carries no customer reference.
        /// </summary>
        private void EnforceContactHoldGuard(Entity target, int toCode)
        {
            if (!_contactHold.IsConfigured)
            {
                _tracing.Trace("StatusTransitionValidator: guard skipped, no hold column configured for this deployment");
                return;
            }

            if (!StatusTransitionMatrix.IsContactBearing(toCode))
            {
                _tracing.Trace($"StatusTransitionValidator: guard skipped, {toCode} is not contact-bearing");
                return;
            }

            var customer = ReadCustomerFromPreImage() ?? ReadCustomerFromTarget(target);
            if (customer == null)
            {
                _tracing.Trace($"StatusTransitionValidator: guard skipped, no customer id (pre-image present: {_context.PreEntityImages.Contains(PreImageAlias)})");
                return;
            }

            if (!IsOnContactHold(customer))
            {
                _tracing.Trace($"StatusTransitionValidator: guard passed, customer {customer.Id} is not on contact hold");
                return;
            }

            ThrowContactHold(StatusTransitionMatrix.GetCaseStatusName(toCode));
        }

        private EntityReference? ReadCustomerFromPreImage()
        {
            if (!_context.PreEntityImages.Contains(PreImageAlias)) return null;
            return _context.PreEntityImages[PreImageAlias]
                .GetAttributeValue<EntityReference>(AttrCustomerId);
        }

        private static EntityReference? ReadCustomerFromTarget(Entity target) =>
            target.GetAttributeValue<EntityReference>(AttrCustomerId);

        /// <summary>
        /// Retrieves only the configured hold column from the customer record, using the logical
        /// name carried by the lookup so contact and account are both served.
        /// One indexed primary-key lookup -- negligible cost inside a sync pre-op.
        /// </summary>
        private bool IsOnContactHold(EntityReference customer)
        {
            var record = _service.Retrieve(
                customer.LogicalName, customer.Id, new ColumnSet(_contactHold.HoldAttribute));
            return record.GetAttributeValue<bool>(_contactHold.HoldAttribute);
        }

        private int? ReadPreImageStatusCode(string attributeName)
        {
            if (!_context.PreEntityImages.Contains(PreImageAlias)) return null;

            return _context.PreEntityImages[PreImageAlias]
                .GetAttributeValue<OptionSetValue>(attributeName)?.Value;
        }

        private void ThrowContactHold(string toName)
        {
            var message = $"Cannot move case to '{toName}': the customer is on contact hold. " +
                          "Clear the hold before resuming collection activities.";
            _tracing.Trace($"StatusTransitionValidator: contact-hold guard blocking -> '{toName}'");
            throw new InvalidPluginExecutionException(message);
        }

        private void ThrowInvalidTransition(string fromName, string toName)
        {
            var message = $"Transition from '{fromName}' to '{toName}' is not permitted.";
            _tracing.Trace($"StatusTransitionValidator: rejecting -- {message}");
            throw new InvalidPluginExecutionException(message);
        }
    }
}
