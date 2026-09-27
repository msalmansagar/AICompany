using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// Enforces one active Collection Case per facility per delinquency episode
    /// (MISIntegration §6; Master Prompt §21).
    ///
    /// The facility is its MIS business identity — <c>qdb_facilitynumber</c> plus
    /// <c>qdb_facilitysourcesystem</c> — so the same facility number in two source systems is
    /// two facilities. No CRM facility record takes part in the check.
    ///
    /// The synchronisation service applies the same rule before it writes; this guard is what
    /// makes the rule hold for every other caller — a form, an import, a script — and it is
    /// deliberately not a plain alternate key, because the rule is status-aware: a facility may
    /// have any number of closed cases and one open one.
    ///
    /// Registered PreOperation, Synchronous, on Create, and on Update filtered to
    /// <c>statecode</c> with a PreImage carrying the two facility columns, so reactivating a
    /// closed case is checked as well.
    /// </summary>
    public sealed class ActiveCaseGuard
    {
        private const string EntityCase = "qdb_collectioncase";
        private const string AttrCaseNumber = "qdb_casenumber";
        private const string AttrFacilityNumber = "qdb_facilitynumber";
        private const string AttrSourceSystem = "qdb_facilitysourcesystem";
        private const string AttrStateCode = "statecode";
        private const string PreImageAlias = "PreImage";
        private const int StateCodeActive = 0;

        private readonly IOrganizationService _service;
        private readonly ITracingService _tracing;
        private readonly IPluginExecutionContext _context;

        /// <summary>Initialises the guard with the three required SDK services.</summary>
        public ActiveCaseGuard(
            IOrganizationService service,
            ITracingService tracing,
            IPluginExecutionContext context)
        {
            _service = service;
            _tracing = tracing;
            _context = context;
        }

        /// <summary>
        /// Throws <see cref="InvalidPluginExecutionException"/> when the write would leave the
        /// facility with a second active case. Does nothing when the write does not make the
        /// case active or carries no facility identity to check.
        /// </summary>
        public void Guard()
        {
            var target = (Entity)_context.InputParameters["Target"];
            if (!WouldBeActive(target)) return;

            var facilityNumber = ReadFacilityValue(target, AttrFacilityNumber);
            var sourceSystem = ReadFacilityValue(target, AttrSourceSystem);
            if (string.IsNullOrWhiteSpace(facilityNumber) || string.IsNullOrWhiteSpace(sourceSystem))
            {
                _tracing.Trace("ActiveCaseGuard: no facility identity on the write, nothing to check");
                return;
            }

            var conflict = FindOtherActiveCase(facilityNumber, sourceSystem, target.Id);
            if (conflict == null)
            {
                _tracing.Trace($"ActiveCaseGuard: no other active case for {sourceSystem}/{facilityNumber}");
                return;
            }

            var conflictNumber = conflict.GetAttributeValue<string>(AttrCaseNumber) ?? conflict.Id.ToString();
            _tracing.Trace($"ActiveCaseGuard: blocking, {conflictNumber} is already active for {sourceSystem}/{facilityNumber}");
            throw new InvalidPluginExecutionException(
                $"Facility {sourceSystem}/{facilityNumber} already has an active Collection Case ({conflictNumber}). " +
                "One active case per facility per delinquency episode: close the current episode before opening another.");
        }

        /// <summary>
        /// A Create is always going to be active. An Update is only of interest when it sets
        /// <c>statecode</c> back to Active — a reopening.
        /// </summary>
        private bool WouldBeActive(Entity target)
        {
            if (_context.MessageName == "Create") return true;
            var state = target.GetAttributeValue<OptionSetValue>(AttrStateCode);
            return state != null && state.Value == StateCodeActive;
        }

        /// <summary>Reads a facility column from the target, falling back to the pre-image on Update.</summary>
        private string ReadFacilityValue(Entity target, string attribute)
        {
            if (target.Contains(attribute)) return target.GetAttributeValue<string>(attribute);
            if (!_context.PreEntityImages.Contains(PreImageAlias)) return null;
            return _context.PreEntityImages[PreImageAlias].GetAttributeValue<string>(attribute);
        }

        /// <summary>One indexed query: active cases for the facility, other than the record being written.</summary>
        private Entity FindOtherActiveCase(string facilityNumber, string sourceSystem, Guid selfId)
        {
            var query = new QueryExpression(EntityCase)
            {
                ColumnSet = new ColumnSet(AttrCaseNumber),
                TopCount = 2,
            };
            query.Criteria.AddCondition(AttrFacilityNumber, ConditionOperator.Equal, facilityNumber);
            query.Criteria.AddCondition(AttrSourceSystem, ConditionOperator.Equal, sourceSystem);
            query.Criteria.AddCondition(AttrStateCode, ConditionOperator.Equal, StateCodeActive);
            if (selfId != Guid.Empty)
            {
                query.Criteria.AddCondition("qdb_collectioncaseid", ConditionOperator.NotEqual, selfId);
            }

            var results = _service.RetrieveMultiple(query);
            return results.Entities.Count == 0 ? null : results.Entities[0];
        }
    }
}
