using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Msst.DebtCollection.Plugins.Domain;

namespace Msst.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// Rejects <c>statuscode</c> changes on <c>msst_dcpcollectioncase</c> and
    /// <c>msst_dcpptprecord</c> that fall outside the allowed-transition matrices
    /// in <see cref="StatusTransitionMatrix"/> (FR-023; appendix paragraphs B.1 and B.2).
    ///
    /// For collection cases the validator also enforces the stop-contact guard
    /// (FR-043/097, section 14.2 decision 1b): a transition into any contact-bearing state
    /// is rejected when the customer referenced by <c>msst_customerid</c> has
    /// <c>msst_stopcontact = true</c>, with the sole exception of a move to
    /// Deceased/Insurance Review.  Cost: one indexed Retrieve of
    /// <c>msst_dcpcustomer</c> (primary-key lookup, single column).
    ///
    /// Registered: PreOperation, Synchronous -- runs inside the transaction so the
    /// invalid write is rolled back before it persists.  Uses a PreImage named
    /// "PreImage" with <c>statuscode</c> and <c>msst_customerid</c> so no extra
    /// case Retrieve is needed.
    /// </summary>
    public sealed class StatusTransitionValidator
    {
        private const string EntityCase = "msst_dcpcollectioncase";
        private const string EntityPtp = "msst_dcpptprecord";
        private const string EntityCustomer = "msst_dcpcustomer";
        private const string AttrCaseStatus = "statuscode";
        private const string AttrPtpStatus = "statuscode";
        private const string AttrCustomerId = "msst_customerid";
        private const string AttrStopContact = "msst_stopcontact";
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

        /// <summary>
        /// Initialises the validator with the three required SDK services.
        /// <paramref name="service"/> is used only for the stop-contact customer
        /// Retrieve on case transitions.
        /// </summary>
        public StatusTransitionValidator(
            IOrganizationService service,
            ITracingService tracing,
            IPluginExecutionContext context)
        {
            _service = service;
            _tracing = tracing;
            _context = context;
        }

        /// <summary>
        /// Validates the status transition for the current entity and message.
        /// Throws <see cref="InvalidPluginExecutionException"/> with a descriptive
        /// message when the transition is not permitted, or when a stop-contact
        /// customer is moved into a contact-bearing case state.
        /// </summary>
        public void ValidateTransition()
        {
            var target = (Entity)_context.InputParameters["Target"];

            if (_context.PrimaryEntityName == EntityCase)
                ValidateCaseTransition(target);
            else if (_context.PrimaryEntityName == EntityPtp)
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

            EnforceStopContactGuard(target, toCode);
        }

        private void ValidatePtpTransition(Entity target)
        {
            if (!target.Contains(AttrPtpStatus)) return;

            var toCode = target.GetAttributeValue<OptionSetValue>(AttrPtpStatus)?.Value
                ?? throw new InvalidPluginExecutionException("PTP statuscode value is null.");

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
        /// with <see cref="StatusTransitionMatrix.PtpStatus.Open"/> for the same reason
        /// as <see cref="NormalizeCaseFromStatus"/>.
        /// </summary>
        private static int NormalizePtpFromStatus(int rawCode) =>
            rawCode == PlatformDefaultStatusCode
                ? StatusTransitionMatrix.PtpStatus.Open
                : rawCode;

        /// <summary>
        /// Blocks a transition into a contact-bearing state when the customer
        /// linked to this case has <c>msst_stopcontact = true</c> (FR-043/097).
        /// Deceased/Insurance Review is not in the contact-bearing set and is
        /// therefore always reachable regardless of the flag (explicit carve-out).
        /// If the case carries no customer reference the guard is skipped.
        /// </summary>
        private void EnforceStopContactGuard(Entity target, int toCode)
        {
            if (!StatusTransitionMatrix.IsContactBearing(toCode))
            {
                _tracing.Trace($"StatusTransitionValidator: guard skipped, {toCode} is not contact-bearing");
                return;
            }

            var customerId = ReadCustomerIdFromPreImage() ?? ReadCustomerIdFromTarget(target);
            if (customerId == null)
            {
                _tracing.Trace($"StatusTransitionValidator: guard skipped, no customer id (pre-image present: {_context.PreEntityImages.Contains(PreImageAlias)})");
                return;
            }

            if (!IsStopContact(customerId.Value))
            {
                _tracing.Trace($"StatusTransitionValidator: guard passed, customer {customerId} is not stop-contact");
                return;
            }

            var toName = StatusTransitionMatrix.GetCaseStatusName(toCode);
            var message = $"Cannot move case to '{toName}': the customer is flagged as " +
                          "stop-contact. Remove the stop-contact flag before resuming " +
                          "collection activities.";
            _tracing.Trace($"StatusTransitionValidator: stop-contact guard blocking -> '{toName}'");
            throw new InvalidPluginExecutionException(message);
        }

        private Guid? ReadCustomerIdFromPreImage()
        {
            if (!_context.PreEntityImages.Contains(PreImageAlias)) return null;
            return _context.PreEntityImages[PreImageAlias]
                .GetAttributeValue<EntityReference>(AttrCustomerId)?.Id;
        }

        private static Guid? ReadCustomerIdFromTarget(Entity target) =>
            target.GetAttributeValue<EntityReference>(AttrCustomerId)?.Id;

        /// <summary>
        /// Retrieves only <c>msst_stopcontact</c> from the customer record.
        /// One indexed primary-key lookup -- negligible cost inside a sync pre-op.
        /// </summary>
        private bool IsStopContact(Guid customerId)
        {
            var customer = _service.Retrieve(
                EntityCustomer, customerId, new ColumnSet(AttrStopContact));
            return customer.GetAttributeValue<bool>(AttrStopContact);
        }

        private int? ReadPreImageStatusCode(string attributeName)
        {
            if (!_context.PreEntityImages.Contains(PreImageAlias)) return null;

            return _context.PreEntityImages[PreImageAlias]
                .GetAttributeValue<OptionSetValue>(attributeName)?.Value;
        }

        private void ThrowInvalidTransition(string fromName, string toName)
        {
            var message = $"Transition from '{fromName}' to '{toName}' is not permitted.";
            _tracing.Trace($"StatusTransitionValidator: rejecting -- {message}");
            throw new InvalidPluginExecutionException(message);
        }
    }
}
