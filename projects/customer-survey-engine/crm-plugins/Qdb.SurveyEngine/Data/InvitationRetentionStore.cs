using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Finds invitation rows older than the retention cutoff and deletes them (FR-CSE-076). The
    /// cascade on qdb_survey_response → qdb_survey_invitation removes associated responses and
    /// answers automatically, so only invitation ids need to be tracked here.
    /// </summary>
    public sealed class InvitationRetentionStore : IInvitationRetentionStore
    {
        private readonly IOrganizationService _service;

        public InvitationRetentionStore(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public IReadOnlyList<Guid> FindGeneratedBefore(DateTime cutoffUtc)
        {
            var query = new QueryExpression("qdb_survey_invitation") { ColumnSet = new ColumnSet(false) };
            query.Criteria.AddCondition("qdb_generated_on", ConditionOperator.LessThan, cutoffUtc);
            query.AddOrder("qdb_generated_on", OrderType.Ascending);
            return _service.RetrieveAll(query).Select(e => e.Id).ToList();
        }

        /// <inheritdoc />
        public void Delete(Guid invitationId) => _service.Delete("qdb_survey_invitation", invitationId);
    }
}
