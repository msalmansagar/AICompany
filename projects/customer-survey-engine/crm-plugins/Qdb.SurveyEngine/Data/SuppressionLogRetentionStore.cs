using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Finds suppression-log rows older than the retention cutoff and deletes them (FR-CSE-077).
    /// Suppression logs are append-only by role, but the retention pass has system-level delete
    /// rights to prune them past the floor.
    /// </summary>
    public sealed class SuppressionLogRetentionStore : ISuppressionLogRetentionStore
    {
        private readonly IOrganizationService _service;

        public SuppressionLogRetentionStore(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public IReadOnlyList<Guid> FindCreatedBefore(DateTime cutoffUtc)
        {
            var query = new QueryExpression("qdb_survey_suppression_log") { ColumnSet = new ColumnSet(false) };
            query.Criteria.AddCondition("createdon", ConditionOperator.LessThan, cutoffUtc);
            query.AddOrder("createdon", OrderType.Ascending);
            return _service.RetrieveAll(query).Select(e => e.Id).ToList();
        }

        /// <inheritdoc />
        public void Delete(Guid suppressionLogId) => _service.Delete("qdb_survey_suppression_log", suppressionLogId);
    }
}
