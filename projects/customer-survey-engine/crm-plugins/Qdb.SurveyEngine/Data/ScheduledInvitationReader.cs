using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Reads the dedupe keys a setup already generated for a scheduled period.</summary>
    public sealed class ScheduledInvitationReader : IScheduledInvitationReader
    {
        private readonly IOrganizationService _service;

        public ScheduledInvitationReader(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public ISet<string> GetDedupeKeys(Guid setupId, string periodKey)
        {
            var query = new QueryExpression("qdb_survey_invitation") { ColumnSet = new ColumnSet("qdb_dedupe_key") };
            query.Criteria.AddCondition("qdb_survey_setup_id", ConditionOperator.Equal, setupId);
            query.Criteria.AddCondition("qdb_schedule_period_key", ConditionOperator.Equal, periodKey);
            query.AddOrder("qdb_survey_invitationid", OrderType.Ascending);
            return new HashSet<string>(_service.RetrieveAll(query).Select(e => e.GetAttributeValue<string>("qdb_dedupe_key")), StringComparer.Ordinal);
        }
    }
}
