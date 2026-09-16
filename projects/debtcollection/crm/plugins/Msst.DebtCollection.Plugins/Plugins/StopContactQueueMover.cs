using System;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Msst.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// Moves all active cases for a customer to the "Deceased &amp; Insurance" queue
    /// when <c>msst_stopcontact</c> flips from <c>false</c> to <c>true</c> on
    /// <c>msst_dcpcustomer</c> (FR-097; §4.4).
    ///
    /// The queue is resolved by name, never by GUID (Article V; ARC-M-001; ANTI-001).
    ///
    /// Registered: PostOperation, Asynchronous — runs after the customer record is
    /// committed. Uses a PreImage named "PreImage" containing <c>msst_stopcontact</c>
    /// to detect the false→true flip. Filter attribute: <c>msst_stopcontact</c>.
    /// </summary>
    public sealed class StopContactQueueMover
    {
        private const string EntityCase = "msst_dcpcollectioncase";
        private const string QueueNameDeceasedInsurance = "Deceased & Insurance";
        private const string AttrStopContact = "msst_stopcontact";
        private const string AttrCustomerId = "msst_customerid";
        private const string PreImageAlias = "PreImage";
        private const int StateCodeActive = 0; // native CRM statecode for active records

        private readonly IOrganizationService _service;
        private readonly ITracingService _tracing;
        private readonly IPluginExecutionContext _context;

        /// <summary>
        /// Initialises the queue mover with the three required SDK services.
        /// </summary>
        public StopContactQueueMover(
            IOrganizationService service,
            ITracingService tracing,
            IPluginExecutionContext context)
        {
            _service = service;
            _tracing = tracing;
            _context = context;
        }

        /// <summary>
        /// Executes the queue-move when <c>msst_stopcontact</c> has flipped to
        /// <c>true</c>. Does nothing when the flag did not change or was already true.
        /// </summary>
        public void MoveToDeceasedQueue()
        {
            var target = (Entity)_context.InputParameters["Target"];

            if (!HasStopContactFlippedToTrue(target)) return;

            var queueId = ResolveQueueByName(QueueNameDeceasedInsurance);
            var activeCases = FindActiveCases(_context.PrimaryEntityId);

            foreach (var activeCase in activeCases.Entities)
                MoveToQueue(activeCase.Id, queueId);

            _tracing.Trace(
                $"StopContactQueueMover: moved {activeCases.Entities.Count} " +
                $"case(s) to '{QueueNameDeceasedInsurance}'");
        }

        private bool HasStopContactFlippedToTrue(Entity target)
        {
            if (!target.Contains(AttrStopContact)) return false;
            if (!target.GetAttributeValue<bool>(AttrStopContact)) return false;

            // When there is no pre-image registered, assume the flag is newly set.
            if (!_context.PreEntityImages.Contains(PreImageAlias)) return true;

            var wasStopContact = _context.PreEntityImages[PreImageAlias]
                .GetAttributeValue<bool>(AttrStopContact);

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
                    "Ensure it is provisioned before marking a customer as stop-contact.");
            }

            return results.Entities[0].Id;
        }

        /// <summary>
        /// Retrieves all active collection cases for the given customer.
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
                ColumnSet = new ColumnSet("msst_dcpcollectioncaseid"),
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
    }
}
