using System;
using System.Collections.Generic;
using Microsoft.Crm.Sdk.Messages;
using Qdb.DebtCollection.Plugins.Domain;
using Qdb.DebtCollection.Plugins.Infrastructure;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// Moves all active <c>qdb_collectioncase</c> rows for a customer to the suppression queue
    /// and sets <c>statuscode = DeceasedInsuranceReview</c> on each eligible case
    /// when the customer's contact-hold column flips from <c>false</c> to <c>true</c>
    /// (FR-097; §4.4; Build-step-1 decision 3, 2026-09-16).
    ///
    /// Which column signals the hold, and on which customer master, is deployment configuration
    /// (<see cref="ContactHoldSettings"/>): the canonical schema owns no customer master, so the
    /// step is registered against whichever QDB master carries the flag. With nothing configured
    /// the mover does nothing, and suppression stays with the Collection services (ADR-DCP-11).
    ///
    /// The status Update passes through <c>StatusTransitionValidator</c> (PreOperation,
    /// Sync) which now permits the transition from every non-terminal state (App §B.1).
    /// Deceased/Insurance Review is not contact-bearing, so the contact-hold guard is
    /// also satisfied. The Update is captured by the platform's native audit.
    ///
    /// Cases already in Deceased/Insurance Review, or in a terminal state
    /// (Under Legal Action, Settled, Closed, Written Off), receive the queue move
    /// but skip the status Update.
    ///
    /// The queue is resolved by name, never by GUID (Article V; ARC-M-001; ANTI-001).
    ///
    /// Registered: PostOperation, Asynchronous — runs after the customer record is
    /// committed. Uses a PreImage named "PreImage" containing the configured hold column
    /// to detect the false-to-true flip, and filters on the same column.
    /// </summary>
    public sealed class StopContactQueueMover
    {
        private const string EntityCase = "qdb_collectioncase";
        private const string AttrCaseId = "qdb_collectioncaseid";
        private const string AttrCustomerId = "qdb_customerid";
        private const string AttrStatusCode = "statuscode";
        private const string PreImageAlias = "PreImage";
        private const int StateCodeActive = 0; // native CRM statecode for active records

        /// <summary>
        /// States where the status Update is skipped: the case is either already in
        /// Deceased/Insurance Review, or in a terminal state the matrix does not permit
        /// the transition from (App §B.1).
        ///
        /// Three of these are genuinely reachable here. The provisioned option set
        /// (scripts/lib/status-codes.mjs) places Deceased/Insurance Review, Under Legal
        /// Action and Settled under statecode 0 (Active), so <see cref="FindActiveCases"/>
        /// returns them and this guard is what stops the refused Update. Only Closed and
        /// Written Off sit under statecode 1 and are filtered out upstream; they are listed
        /// for defence in depth should that mapping ever change.
        /// </summary>
        private static readonly HashSet<int> SkipStatusUpdateStates = new HashSet<int>
        {
            StatusTransitionMatrix.CaseStatus.DeceasedInsuranceReview,
            StatusTransitionMatrix.CaseStatus.UnderLegalAction,
            StatusTransitionMatrix.CaseStatus.Settled,
            StatusTransitionMatrix.CaseStatus.Closed,
            StatusTransitionMatrix.CaseStatus.WrittenOff,
        };

        private readonly IOrganizationService _service;
        private readonly ITracingService _tracing;
        private readonly IPluginExecutionContext _context;
        private readonly ContactHoldSettings _contactHold;

        /// <summary>
        /// Initialises the queue mover with the execution services and the deployment's
        /// contact-hold configuration.
        /// </summary>
        /// <param name="context">Services and execution metadata for this invocation.</param>
        /// <param name="contactHold">Which customer column signals a hold, and which queue receives the cases.</param>
        public StopContactQueueMover(PluginContext context, ContactHoldSettings contactHold)
        {
            _service = context.OrganizationService;
            _tracing = context.TracingService;
            _context = context.ExecutionContext;
            _contactHold = contactHold ?? ContactHoldSettings.NotConfigured;
        }

        /// <summary>
        /// Moves all active cases to the suppression queue and sets
        /// <c>statuscode = DeceasedInsuranceReview</c> on each eligible case when
        /// the configured hold column has flipped to <c>true</c>. Does nothing when
        /// no hold column is configured, or when the flag did not change or was already true.
        /// </summary>
        public void MoveToDeceasedQueue()
        {
            if (!_contactHold.IsConfigured)
            {
                _tracing.Trace("StopContactQueueMover: inactive, no hold column configured for this deployment");
                return;
            }

            var target = (Entity)_context.InputParameters["Target"];

            if (!HasStopContactFlippedToTrue(target)) return;

            var queueName = _contactHold.SuppressionQueueName;
            var queueId = ResolveQueueByName(queueName);
            var activeCases = FindActiveCases(_context.PrimaryEntityId);
            var failures = SuppressEachCase(activeCases, queueId);

            _tracing.Trace(
                $"StopContactQueueMover: processed {activeCases.Entities.Count} " +
                $"case(s) for '{queueName}', {failures.Count} failed");

            if (failures.Count > 0) throw BuildPartialFailureException(failures);
        }

        /// <summary>
        /// Applies the queue move and the status update to every active case,
        /// isolating each one so a single refusal cannot strand the cases after it.
        /// Suppression is a compliance control: a case the platform refuses must not
        /// stop the remaining cases from leaving their contact-bearing status.
        /// </summary>
        /// <returns>The id and reason for each case that could not be suppressed.</returns>
        private List<string> SuppressEachCase(EntityCollection activeCases, Guid queueId)
        {
            var failures = new List<string>();

            foreach (var activeCase in activeCases.Entities)
            {
                // Catch-all is deliberate: the per-case reason is unknowable in advance
                // (validator refusal, queue fault, row-level security). Nothing is
                // swallowed - every failure is traced and re-thrown in aggregate below.
                try
                {
                    MoveToQueue(activeCase.Id, queueId);
                    SetDeceasedInsuranceStatus(activeCase);
                }
                catch (Exception error)
                {
                    _tracing.Trace(
                        $"StopContactQueueMover: case {activeCase.Id} failed - {error.Message}");
                    failures.Add($"{activeCase.Id}: {error.Message}");
                }
            }

            return failures;
        }

        /// <summary>
        /// Builds the aggregate failure surfaced on the async system job so a partial
        /// suppression is visible and retryable rather than silently incomplete.
        /// </summary>
        private static InvalidPluginExecutionException BuildPartialFailureException(
            List<string> failures) =>
            new InvalidPluginExecutionException(
                $"StopContactQueueMover could not suppress {failures.Count} case(s): " +
                string.Join("; ", failures.ToArray()));

        private bool HasStopContactFlippedToTrue(Entity target)
        {
            if (!target.Contains(_contactHold.HoldAttribute)) return false;
            if (!target.GetAttributeValue<bool>(_contactHold.HoldAttribute)) return false;

            // When there is no pre-image registered, assume the flag is newly set.
            if (!_context.PreEntityImages.Contains(PreImageAlias)) return true;

            var wasStopContact = _context.PreEntityImages[PreImageAlias]
                .GetAttributeValue<bool>(_contactHold.HoldAttribute);

            return !wasStopContact; // true only when it was false before
        }

        private Guid ResolveQueueByName(string queueName)
        {
            var query = new QueryExpression("queue")
            {
                ColumnSet = new ColumnSet("queueid"),
                TopCount = 1,
            };
            query.Criteria.AddCondition("name", ConditionOperator.Equal, queueName);

            var results = _service.RetrieveMultiple(query);
            if (results.Entities.Count == 0)
            {
                _tracing.Trace($"StopContactQueueMover: queue '{queueName}' not found");
                throw new InvalidPluginExecutionException(
                    $"Queue '{queueName}' was not found. " +
                    "Ensure it is provisioned before placing a customer on contact hold.");
            }

            return results.Entities[0].Id;
        }

        /// <summary>
        /// Retrieves all active collection cases for the given customer, including
        /// <c>statuscode</c> so the status-update skip check needs no second read.
        ///
        /// No paging is applied.  The platform imposes a 5,000-row ceiling on a
        /// single <see cref="Microsoft.Xrm.Sdk.Query.QueryExpression"/> result,
        /// but that bound is physically unreachable here: a single customer holds
        /// a small, bounded number of facilities and therefore active cases
        /// (single-digit in practice; no business process creates thousands of
        /// cases for one customer).  Adding a PageInfo loop would be defensive
        /// code for an impossible input — YAGNI (common.md).
        /// </summary>
        private EntityCollection FindActiveCases(Guid customerId)
        {
            var query = new QueryExpression(EntityCase)
            {
                ColumnSet = new ColumnSet(AttrCaseId, AttrStatusCode),
            };
            query.Criteria.AddCondition(AttrCustomerId, ConditionOperator.Equal, customerId);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, StateCodeActive);
            return _service.RetrieveMultiple(query);
        }

        private void MoveToQueue(Guid caseId, Guid queueId)
        {
            var request = new AddToQueueRequest
            {
                DestinationQueueId = queueId,
                Target = new EntityReference(EntityCase, caseId),
            };
            _service.Execute(request);
        }

        /// <summary>
        /// Issues a <c>statuscode = DeceasedInsuranceReview</c> Update on
        /// <paramref name="caseEntity"/> unless the case is already in that state
        /// or in a terminal state. The Update passes through
        /// <c>StatusTransitionValidator</c> (do not bypass it).
        /// </summary>
        private void SetDeceasedInsuranceStatus(Entity caseEntity)
        {
            var currentStatus = caseEntity.GetAttributeValue<OptionSetValue>(AttrStatusCode)?.Value ?? 0;
            if (!ShouldSetDeceasedStatus(currentStatus)) return;

            var update = new Entity(EntityCase, caseEntity.Id);
            update[AttrStatusCode] = new OptionSetValue(
                StatusTransitionMatrix.CaseStatus.DeceasedInsuranceReview);
            _service.Update(update);

            _tracing.Trace(
                $"StopContactQueueMover: set case {caseEntity.Id} statuscode -> DeceasedInsuranceReview");
        }

        private static bool ShouldSetDeceasedStatus(int currentStatus) =>
            !SkipStatusUpdateStates.Contains(currentStatus);
    }
}
